import json
from datetime import timedelta

import requests
from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.reviews.models import Review

from .models import Analysis
from .schema import INSTRUCTIONS, OUTPUT_SCHEMA
from .services import validate_output


def enqueue(analysis_id):
    try:
        run_analysis.delay(analysis_id)
    except Exception:
        # Do not leak broker credentials or evidence into error logs.
        Analysis.objects.filter(id=analysis_id, state="QUEUED").update(
            state="FAILED", error_code="QUEUE_UNAVAILABLE"
        )


@shared_task
def reconcile_interrupted_runs():
    cutoff = timezone.now() - timedelta(minutes=10)
    # Mark abandoned jobs explicitly; never launch another paid provider call silently.
    return Analysis.objects.filter(
        Q(state="QUEUED", updated_at__lt=cutoff) | Q(state__in=["RUNNING", "RETRYING"], started_at__lt=cutoff)
    ).update(state="FAILED", error_code="WORKER_INTERRUPTED", updated_at=timezone.now())


@shared_task(bind=True, max_retries=2, soft_time_limit=100, time_limit=110)
def run_analysis(self, analysis_id):
    with transaction.atomic():
        obj = Analysis.objects.select_for_update().get(id=analysis_id)
        if obj.state not in ["QUEUED", "RETRYING"]:
            return
        review = Review.objects.get(id=obj.review_id)
        if review.round != obj.round or review.state not in ["SUBMITTED", "CONVERSATION_READY"]:
            obj.state = "STALE"
            obj.save(update_fields=["state"])
            return
        obj.state = "RUNNING"
        obj.attempts += 1
        obj.started_at = timezone.now()
        obj.save(update_fields=["state", "attempts", "started_at"])
    attempt = obj.attempts
    body = {
        "run_id": str(obj.id),
        "input_hash": obj.input_hash,
        "request": {
            "model": obj.model,
            "store": False,
            "instructions": INSTRUCTIONS,
            "input": json.dumps(obj.input_snapshot),
            "max_output_tokens": 5000,
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "stewardship_coaching",
                    "strict": True,
                    "schema": OUTPUT_SCHEMA,
                }
            },
        },
    }
    try:
        response = requests.post(
            settings.N8N_WEBHOOK_URL,
            json=body,
            headers={"X-BFL-Token": settings.N8N_WEBHOOK_TOKEN, "X-Request-ID": str(obj.id)},
            timeout=(5, 80),
            allow_redirects=False,
        )
        response.raise_for_status()
        if len(response.content) > 250000:
            raise ValueError("Response too large")
        result = response.json()
        if result.get("status") != "completed":
            raise ValueError("Provider incomplete or refused")
        text = "".join(
            c.get("text", "")
            for message in result.get("output", [])
            if message.get("type") == "message"
            for c in message.get("content", [])
            if c.get("type") == "output_text"
        )
        output = json.loads(text)
        validate_output(output, {s["id"] for s in obj.input_snapshot["sources"]})
    except (requests.Timeout, requests.ConnectionError) as exc:
        changed = Analysis.objects.filter(id=obj.id, state="RUNNING", attempts=attempt).update(
            state="RETRYING" if self.request.retries < 2 else "FAILED", error_code="PROVIDER_UNAVAILABLE"
        )
        if changed and self.request.retries < 2:
            raise self.retry(
                exc=RuntimeError("Provider temporarily unavailable"),
                countdown=15 * (self.request.retries + 1),
            ) from exc
        return
    except Exception:
        Analysis.objects.filter(id=obj.id, state="RUNNING", attempts=attempt).update(
            state="FAILED", error_code="INVALID_OR_FAILED_RESPONSE"
        )
        return
    with transaction.atomic():
        review = Review.objects.select_for_update().get(id=obj.review_id)
        obj = Analysis.objects.select_for_update().get(id=obj.id)
        if obj.state != "RUNNING" or obj.attempts != attempt:
            return
        obj.state = (
            "SUCCEEDED"
            if review.round == obj.round and review.state in ["SUBMITTED", "CONVERSATION_READY"]
            else "STALE"
        )
        obj.output = output
        obj.error_code = ""
        obj.provider_response_id = str(result.get("id", ""))[:200]
        obj.save(update_fields=["state", "output", "error_code", "provider_response_id", "updated_at"])
