import hashlib
import json
from urllib.parse import urlparse

import jsonschema
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.audit.services import record
from apps.reviews.services import current_forms, evidence_ready, lock, require_reviewer

from .models import Analysis
from .schema import OUTPUT_SCHEMA, PROMPT_VERSION


def configured():
    return bool(settings.N8N_WEBHOOK_URL and settings.N8N_WEBHOOK_TOKEN and settings.OPENAI_MODEL)


def make_input(review):
    forms = current_forms(review)
    if forms.filter(submitted_at__isnull=False).count() != 2:
        raise ValidationError("Submit both formal forms before requesting coaching.")
    evidence = evidence_ready(review).filter(validation="VALIDATED")
    sources = [
        {"id": str(f.id), "type": f.kind + "_SUBMISSION", "content": f.content}
        for f in forms.order_by("kind")
    ]
    sources += [
        {"id": str(e.id), "type": "VALIDATED_EVIDENCE", "content": e.authorised_excerpt}
        for e in evidence.order_by("id")
    ]
    # No names, contact details, file URLs, private workbook or raw file contents.
    return {
        "period": {"year": review.cycle.year, "kind": review.cycle.kind},
        "senior_leader": review.employee.senior_leader,
        "sources": sources,
    }


@transaction.atomic
def request_analysis(member, review, version):
    review = lock(member, review, version)
    require_reviewer(member, review)
    if review.state not in ["SUBMITTED", "CONVERSATION_READY"]:
        raise ValidationError(
            "Coaching is available after both submissions and before the shared conversation record."
        )
    if not configured():
        raise ValidationError(
            "AI is not configured. Continue a human-led review or configure the server integration."
        )
    url = urlparse(settings.N8N_WEBHOOK_URL)
    if url.scheme != "https" and not (settings.DEBUG and url.hostname in ["localhost", "127.0.0.1", "n8n"]):
        raise ValidationError("The AI orchestration endpoint must use HTTPS.")
    payload = make_input(review)
    if len(json.dumps(payload)) > 150000:
        raise ValidationError(
            "The authorised source set is too large. Shorten the excerpts before requesting analysis."
        )
    digest = hashlib.sha256(
        json.dumps(
            {"input": payload, "prompt": PROMPT_VERSION, "model": settings.OPENAI_MODEL}, sort_keys=True
        ).encode()
    ).hexdigest()
    obj, created = Analysis.objects.get_or_create(
        company=member.company,
        review=review,
        round=review.round,
        input_hash=digest,
        defaults={"requested_by": member, "input_snapshot": payload, "model": settings.OPENAI_MODEL},
    )
    if created:
        record(member, "ai.requested", obj, input_hash=digest)
        from .tasks import enqueue

        transaction.on_commit(lambda: enqueue(str(obj.id)))
    elif obj.state == "FAILED" and obj.attempts < 3:
        obj.state = "QUEUED"
        obj.error_code = ""
        obj.save(update_fields=["state", "error_code", "updated_at"])
        record(member, "ai.retry_requested", obj)
        from .tasks import enqueue

        transaction.on_commit(lambda: enqueue(str(obj.id)))
    return obj


def validate_output(output, source_ids):
    jsonschema.validate(output, OUTPUT_SCHEMA)
    if len(json.dumps(output)) > 100000:
        raise ValueError("Output too large")
    for group in ["strengths", "gaps", "support_options"]:
        if len(output[group]) > 12:
            raise ValueError("Too many observations")
        for item in output[group]:
            if not item["source_ids"] or not set(item["source_ids"]).issubset(source_ids):
                raise ValueError("Unknown or missing source citation")


@transaction.atomic
def decide(member, review, analysis_id, decision, notes):
    # Serialize against finalisation and revision.
    review = lock(member, review, review.version)
    require_reviewer(member, review)
    obj = (
        Analysis.objects.select_for_update()
        .filter(id=analysis_id, review=review, round=review.round, state="SUCCEEDED")
        .first()
    )
    if not obj or obj.decision:
        raise ValidationError("Choose an unreviewed successful analysis in the current round.")
    if decision not in ["ACCEPTED", "REJECTED"] or not notes.strip():
        raise ValidationError("Record a human decision and rationale for the coaching output.")
    obj.decision, obj.decision_notes, obj.reviewed_at = decision, notes, timezone.now()
    obj.save(update_fields=["decision", "decision_notes", "reviewed_at", "updated_at"])
    record(member, "ai.reviewed", obj, decision=decision)
    return obj
