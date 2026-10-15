import json
from datetime import timedelta
from unittest.mock import Mock, patch

import requests
from django.test import TestCase, override_settings
from django.utils import timezone
from jsonschema import ValidationError

from apps.ai_coach.models import Analysis
from apps.ai_coach.schema import INSTRUCTIONS, OUTPUT_SCHEMA
from apps.ai_coach.services import configured, make_input, request_analysis, validate_output
from apps.ai_coach.tasks import reconcile_interrupted_runs, run_analysis

from . import test_reviews as fixture
from .coaching_fixtures import PILLAR_NAMES, context_coaching, empty_pillar_coaching


@override_settings(
    N8N_WEBHOOK_URL="https://automation.example/webhook/bfl",
    N8N_WEBHOOK_TOKEN="test-only",
    OPENAI_MODEL="configured-model",
)
class CoachingTests(TestCase):
    person = fixture.ReviewTests.person
    acting = fixture.ReviewTests.acting
    launch = fixture.ReviewTests.launch
    submit = fixture.ReviewTests.submit
    content = fixture.ReviewTests.content

    def setUp(self):
        fixture.ReviewTests.setUp(self)
        self.review = self.launch()

    def ready(self):
        self.submit(self.review, "EMPLOYEE")
        self.submit(self.review, "MANAGER")

    def output(self, source):
        return context_coaching({
            "strengths": [
                {
                    "observation": "A reported outcome",
                    "source_ids": [source],
                    "question": "What evidence supports this?",
                    "uncertainty": "Reported claim",
                }
            ],
            "gaps": [],
            "support_options": [],
            "limitations": ["No validated evidence supplied."],
        })

    def test_incomplete_submissions_block_ai(self):
        result = self.acting(self.nimal).post(
            f"/api/v1/reviews/{self.review.id}/ai-coaching/", {"version": 1}, format="json"
        )
        self.assertEqual(result.status_code, 400)
        self.assertEqual(Analysis.objects.count(), 0)

    def test_interrupted_worker_is_recoverable_without_changing_review(self):
        self.ready()
        analysis = request_analysis(self.nimal, self.review, self.review.version)
        Analysis.objects.filter(pk=analysis.pk).update(
            state="RUNNING", started_at=timezone.now() - timedelta(minutes=11)
        )
        self.assertEqual(reconcile_interrupted_runs(), 1)
        analysis.refresh_from_db()
        self.review.refresh_from_db()
        self.assertEqual(analysis.state, "FAILED")
        self.assertEqual(analysis.error_code, "WORKER_INTERRUPTED")
        self.assertEqual(self.review.state, "SUBMITTED")

    def test_manager_cannot_request(self):
        self.ready()
        result = self.acting(self.hr).post(
            f"/api/v1/reviews/{self.review.id}/ai-coaching/", {"version": self.review.version}, format="json"
        )
        self.assertEqual(result.status_code, 403)

    def test_inputs_are_submitted_only_and_duplicate_is_idempotent(self):
        self.ready()
        a = request_analysis(self.nimal, self.review, self.review.version)
        b = request_analysis(self.nimal, self.review, self.review.version)
        self.assertEqual(a.id, b.id)
        payload = make_input(self.review)
        self.assertEqual(len(payload["sources"]), 2)
        self.assertNotIn("email", json.dumps(payload))
        self.assertEqual(len(payload["pillar_reviews"]), 5)
        self.assertTrue(all(row["target"] is None for row in payload["pillar_reviews"].values()))

    def test_unknown_citation_and_extra_rating_are_rejected(self):
        with self.assertRaises(ValueError):
            validate_output(self.output("outside-tenant"), {"allowed"})
        with self.assertRaises(ValueError):
            validate_output(self.output("knowledge:0:book"), {"allowed"})
        invalid = self.output("allowed")
        invalid["rating"] = "Strong"
        with self.assertRaises(ValidationError):
            validate_output(invalid, {"allowed"})
        invalid = self.output("allowed")
        invalid["pillar_coaching"]["context"]["strengths"][0]["steward_judgement"] = "Exceptional"
        with self.assertRaises(ValidationError):
            validate_output(invalid, {"allowed"})

    def test_all_pillars_and_observation_citations_are_required(self):
        valid = self.output("allowed")
        validate_output(valid, {"allowed"})
        for pillar in ("context", "character", "capability", "continuity", "contribution"):
            with self.subTest(pillar=pillar):
                invalid = self.output("allowed")
                del invalid["pillar_coaching"][pillar]
                with self.assertRaises(ValidationError):
                    validate_output(invalid, {"allowed"})
        invalid = self.output("allowed")
        invalid["pillar_coaching"]["context"]["strengths"][0]["source_ids"] = []
        with self.assertRaises(ValueError):
            validate_output(invalid, {"allowed"})
        del invalid["pillar_coaching"]["context"]["strengths"][0]["source_ids"]
        with self.assertRaises(ValidationError):
            validate_output(invalid, {"allowed"})
        with self.assertRaises(ValidationError):
            validate_output(valid["pillar_coaching"]["context"], {"allowed"})

    def test_citation_rules_for_each_group_and_pillar(self):
        for pillar in PILLAR_NAMES:
            for group in ("strengths", "gaps", "support_options"):
                for citations in (["allowed"], [], ["unknown"], ["btfl-stewardship-guide:chunk:23"],
                                  ["allowed", "btfl-stewardship-guide:chunk:23"]):
                    with self.subTest(pillar=pillar, group=group, citations=citations):
                        output = empty_pillar_coaching()
                        output["pillar_coaching"][pillar][group] = [{
                            "observation": "A coaching observation", "source_ids": citations,
                            "question": "What would help?", "uncertainty": "",
                        }]
                        if citations == ["allowed"] or (not citations and group == "support_options"):
                            validate_output(output, {"allowed"})
                        else:
                            with self.assertRaises(ValueError):
                                validate_output(output, {"allowed"})

    def test_limitations_remain_strings_only(self):
        for pillar in PILLAR_NAMES:
            output = empty_pillar_coaching()
            output["pillar_coaching"][pillar]["limitations"] = ["No validated evidence supplied."]
            validate_output(output, {"allowed"})
            for invalid in (42, {"observation": "Missing evidence", "source_ids": []}):
                with self.subTest(pillar=pillar, invalid=invalid):
                    output["pillar_coaching"][pillar]["limitations"] = [invalid]
                    with self.assertRaises(ValidationError):
                        validate_output(output, {"allowed"})

    @patch("apps.ai_coach.tasks.requests.post")
    def test_successful_coaching_never_changes_assessment(self, http):
        self.ready()
        assessment = {"overall": "Strong Steward", "rationale": "Human assessment"}
        self.review.hr_assessment = assessment
        self.review.save(update_fields=["hr_assessment"])
        obj = request_analysis(self.nimal, self.review, self.review.version)
        output = self.output(obj.input_snapshot["sources"][0]["id"])
        # Methodology-derived suggestions are valid without employee evidence citations.
        for pillar in output["pillar_coaching"].values():
            pillar["support_options"] = [{
                "observation": "Consider structured feedback sessions.",
                "source_ids": [], "question": "What support would help?", "uncertainty": "",
            }]
        http.return_value = Mock(
            content=b"{}",
            json=lambda: {
                "id": "provider-1",
                "status": "completed",
                "output": [
                    {"type": "message", "content": [{"type": "output_text", "text": json.dumps(output)}]}
                ],
            },
        )
        run_analysis.run(str(obj.id))
        obj.refresh_from_db()
        self.review.refresh_from_db()
        self.assertEqual(obj.state, "SUCCEEDED")
        self.assertEqual(obj.output, output)
        self.assertEqual(self.review.hr_assessment, assessment)
        self.assertEqual(self.review.state, "SUBMITTED")
        sent = http.call_args.kwargs["json"]["request"]
        body = http.call_args.kwargs["json"]
        self.assertEqual(body["run_id"], str(obj.id))
        self.assertEqual(body["input_hash"], obj.input_hash)
        self.assertEqual(json.loads(sent["input"]), obj.input_snapshot)
        self.assertEqual(sent["model"], obj.model)
        self.assertEqual(sent["instructions"], INSTRUCTIONS)
        self.assertIn("Do not choose a winner or alter the human assessment.", sent["instructions"])
        self.assertEqual(sent["text"]["format"], {
            "type": "json_schema", "name": "stewardship_coaching",
            "strict": True, "schema": OUTPUT_SCHEMA,
        })
        self.assertFalse(sent["store"])
        self.assertNotIn("tools", sent)
        self.assertEqual(http.call_args.args, ("https://automation.example/webhook/bfl",))
        self.assertEqual(set(http.call_args.kwargs), {"json", "timeout", "allow_redirects"})
        self.assertEqual(set(body), {"run_id", "input_hash", "request"})
        prepared = requests.Request("POST", http.call_args.args[0], json=body).prepare()
        self.assertEqual(prepared.headers["Content-Type"], "application/json")
        self.assertNotIn("Authorization", prepared.headers)
        self.assertNotIn("X-BFL-Token", prepared.headers)
        self.assertNotIn("test-only", prepared.body.decode())
        self.assertEqual(obj.provider_response_id, "provider-1")

    @override_settings(N8N_WEBHOOK_TOKEN="")
    def test_empty_token_does_not_block_success(self):
        self.assertTrue(configured())
        self.test_successful_coaching_never_changes_assessment()

    @override_settings()
    def test_absent_token_setting_does_not_block_success(self):
        from django.conf import settings
        del settings.N8N_WEBHOOK_TOKEN
        self.assertTrue(configured())
        self.test_successful_coaching_never_changes_assessment()

    @patch("apps.ai_coach.tasks.requests.post")
    def test_http_500_preserves_provider_failure(self, http):
        self.ready()
        obj = request_analysis(self.nimal, self.review, self.review.version)
        response = requests.Response()
        response.status_code = 500
        response._content = b"sensitive provider body"
        http.return_value = response
        with self.assertLogs("apps.ai_coach.tasks", level="INFO") as logs:
            run_analysis.run(str(obj.id))
        obj.refresh_from_db()
        self.assertEqual(obj.state, "FAILED")
        self.assertEqual(obj.error_code, "INVALID_OR_FAILED_RESPONSE")
        self.assertIn("status=500", " ".join(logs.output))
        self.assertNotIn("sensitive provider body", " ".join(logs.output))

    @patch("apps.ai_coach.tasks.requests.post")
    def test_timeout_and_connection_failure_are_provider_unavailable(self, http):
        self.ready()
        obj = request_analysis(self.nimal, self.review, self.review.version)
        for error in [requests.Timeout, requests.ConnectionError]:
            with self.subTest(error=error.__name__):
                Analysis.objects.filter(pk=obj.pk).update(state="QUEUED")
                http.side_effect = error("sensitive exception text")
                run_analysis.push_request(retries=2)
                try:
                    with self.assertLogs("apps.ai_coach.tasks", level="WARNING") as logs:
                        run_analysis.run(str(obj.id))
                finally:
                    run_analysis.pop_request()
                obj.refresh_from_db()
                self.assertEqual(obj.state, "FAILED")
                self.assertEqual(obj.error_code, "PROVIDER_UNAVAILABLE")
                self.assertNotIn("sensitive exception text", " ".join(logs.output))

    @patch("apps.ai_coach.tasks.requests.post")
    def test_invalid_response_is_failed_and_human_review_remains_available(self, http):
        self.ready()
        obj = request_analysis(self.nimal, self.review, self.review.version)
        http.return_value = Mock(content=b"{}", json=lambda: {"status": "incomplete"})
        run_analysis.run(str(obj.id))
        obj.refresh_from_db()
        self.review.refresh_from_db()
        self.assertEqual(obj.state, "FAILED")
        self.assertEqual(self.review.state, "SUBMITTED")
