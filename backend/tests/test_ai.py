import json
from datetime import timedelta
from unittest.mock import Mock, patch

from django.test import TestCase, override_settings
from django.utils import timezone

from apps.ai_coach.models import Analysis
from apps.ai_coach.services import make_input, request_analysis, validate_output
from apps.ai_coach.tasks import reconcile_interrupted_runs, run_analysis

from . import test_reviews as fixture


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
        return {
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
        }

    def test_incomplete_submissions_block_ai(self):
        result = self.acting(self.hr).post(
            f"/api/v1/reviews/{self.review.id}/ai-coaching/", {"version": 1}, format="json"
        )
        self.assertEqual(result.status_code, 400)
        self.assertEqual(Analysis.objects.count(), 0)

    def test_interrupted_worker_is_recoverable_without_changing_review(self):
        self.ready()
        analysis = request_analysis(self.hr, self.review, self.review.version)
        Analysis.objects.filter(pk=analysis.pk).update(
            state="RUNNING", started_at=timezone.now() - timedelta(minutes=11)
        )
        self.assertEqual(reconcile_interrupted_runs(), 1)
        analysis.refresh_from_db()
        self.review.refresh_from_db()
        self.assertEqual(analysis.state, "FAILED")
        self.assertEqual(analysis.error_code, "WORKER_INTERRUPTED")
        self.assertEqual(self.review.state, "SUBMITTED")

    def test_only_appointed_hr_can_request(self):
        self.ready()
        result = self.acting(self.sarah).post(
            f"/api/v1/reviews/{self.review.id}/ai-coaching/", {"version": self.review.version}, format="json"
        )
        self.assertEqual(result.status_code, 403)

    def test_inputs_are_submitted_only_and_duplicate_is_idempotent(self):
        self.ready()
        a = request_analysis(self.hr, self.review, self.review.version)
        b = request_analysis(self.hr, self.review, self.review.version)
        self.assertEqual(a.id, b.id)
        payload = make_input(self.review)
        self.assertEqual(len(payload["sources"]), 2)
        self.assertNotIn("email", json.dumps(payload))

    def test_unknown_citation_and_extra_rating_are_rejected(self):
        with self.assertRaises(ValueError):
            validate_output(self.output("outside-tenant"), {"allowed"})
        invalid = self.output("allowed")
        invalid["rating"] = "Strong"
        with self.assertRaises(Exception):
            validate_output(invalid, {"allowed"})

    @patch("apps.ai_coach.tasks.requests.post")
    def test_successful_coaching_never_changes_assessment(self, http):
        self.ready()
        obj = request_analysis(self.hr, self.review, self.review.version)
        output = self.output(obj.input_snapshot["sources"][0]["id"])
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
        self.assertEqual(self.review.hr_assessment, {})
        self.assertEqual(self.review.state, "SUBMITTED")
        sent = http.call_args.kwargs["json"]["request"]
        self.assertFalse(sent["store"])
        self.assertNotIn("tools", sent)

    @patch("apps.ai_coach.tasks.requests.post")
    def test_invalid_response_is_failed_and_human_review_remains_available(self, http):
        self.ready()
        obj = request_analysis(self.hr, self.review, self.review.version)
        http.return_value = Mock(content=b"{}", json=lambda: {"status": "incomplete"})
        run_analysis.run(str(obj.id))
        obj.refresh_from_db()
        self.review.refresh_from_db()
        self.assertEqual(obj.state, "FAILED")
        self.assertEqual(self.review.state, "SUBMITTED")
