from copy import deepcopy
from datetime import date
from unittest.mock import patch

from django.test import TestCase, override_settings

from apps.ai_coach.services import make_input
from apps.audit.models import AuditLog
from apps.reviews.models import PillarTarget, Review
from apps.reviews.schemas import PILLARS
from apps.reviews.workflow import workflow_status

from . import test_reviews as fixture
from .coaching_fixtures import context_coaching


@override_settings(
    N8N_WEBHOOK_URL="https://example.test/coach", N8N_WEBHOOK_TOKEN="test", OPENAI_MODEL="test"
)
class PillarCycleTests(TestCase):
    person = fixture.ReviewTests.person
    acting = fixture.ReviewTests.acting
    launch = fixture.ReviewTests.launch
    submit = fixture.ReviewTests.submit
    agree_commitments = fixture.ReviewTests.agree_commitments
    finish = fixture.ReviewTests.finish

    def setUp(self):
        fixture.ReviewTests.setUp(self)
        self.cycle.workflow_version = 2
        self.cycle.save()
        clock = patch("django.utils.timezone.localdate", return_value=date(2026, 5, 1))
        clock.start()
        self.addCleanup(clock.stop)

    def content(self, kind):
        if kind == "EMPLOYEE":
            return {"pillars": {p: f"Reflection on {p}" for p in PILLARS}}
        return {
            "pillars": {
                p: {
                    "narrative": f"Assessment of {p}",
                    "descriptor": "Strong",
                    "outcome": "Achieved",
                    "evidence_ids": [],
                }
                for p in PILLARS
            },
            "overall": "Strong Steward",
            "summary": "Human judgement across all five pillars",
        }

    def setup_targets(self, employee=None, complete=True, actor=None, expected=200, suffix=""):
        employee = employee or self.nimal.profile
        old = {r.pillar: r for r in self.cycle.targets.filter(employee=employee)}
        payload = {
            "employee": str(employee.id),
            "complete": complete,
            "targets": [
                {
                    "pillar": p,
                    "target": f"Target {p}{suffix}",
                    "success_measure": "Observable success",
                    "notes": "Expected behaviour",
                    "version": old[p].version if p in old else 0,
                }
                for p in PillarTarget.Pillar.values
            ],
        }
        response = self.acting(actor or self.hr).post(
            f"/api/v1/review-cycles/{self.cycle.id}/targets/", payload, format="json"
        )
        self.assertEqual(response.status_code, expected, response.data)
        return response

    def start(self, expected=200):
        response = self.acting(self.hr).post(
            f"/api/v1/review-cycles/{self.cycle.id}/start/", {}, format="json"
        )
        self.assertEqual(response.status_code, expected, response.data)
        self.cycle.refresh_from_db()

    def growth(self, shared=True, actor=None, expected=201):
        payload = {
            "kind": "CONTRIBUTION",
            "category": "Other contribution",
            "title": "Approval redesign",
            "details": "Measured processing results",
            "outcome": "2.5 days",
            "shared": shared,
        }
        response = self.acting(actor or self.nimal).post("/api/v1/growth/", payload, format="json")
        self.assertEqual(response.status_code, expected, response.data)
        return response

    def test_pillar_ai_endpoint_requires_both_submissions_and_contains_judgements(self):
        self.setup_targets()
        self.start()
        review = self.launch()
        url = f"/api/v1/reviews/{review.id}/ai-coaching/"
        self.assertEqual(
            self.acting(self.nimal).post(url, {"version": review.version}, format="json").status_code, 400
        )
        self.submit(review, "EMPLOYEE")
        self.assertEqual(
            self.acting(self.nimal).post(url, {"version": review.version}, format="json").status_code, 400
        )
        self.submit(review, "MANAGER")
        with patch("apps.ai_coach.tasks.enqueue"), self.captureOnCommitCallbacks(execute=True):
            response = self.acting(self.nimal).post(url, {"version": review.version}, format="json")
        self.assertEqual(response.status_code, 202, response.data)
        sources = review.analyses.get().input_snapshot["sources"]
        appraisal = next(s["content"] for s in sources if s["type"] == "MANAGER_SUBMISSION")
        self.assertEqual(set(appraisal["pillars"]), set(PILLARS))
        self.assertEqual(appraisal["pillars"]["context"]["outcome"], "Achieved")
        self.assertEqual(appraisal["pillars"]["context"]["descriptor"], "Strong")
        self.assertEqual(len([s for s in sources if s["type"] == "PILLAR_TARGET"]), 5)

    def test_yearend_pillar_appraisal_ignores_historical_commitment_outcomes(self):
        from apps.reviews.models import ReviewCycle

        self.setup_targets()
        self.start()
        prior = self.launch()
        self.submit(prior, "EMPLOYEE")
        self.submit(prior, "MANAGER")
        self.agree_commitments(prior)
        self.finish(prior)
        baseline = deepcopy(prior.snapshot.content)
        self.assertTrue(baseline["commitments"])
        self.cycle = ReviewCycle.objects.create(
            company=self.company, workflow_version=2, kind="YEAR_END", year=2026,
            starts_on=date(2026, 7, 1), ends_on=date(2026, 12, 31), due_on=date(2027, 1, 15),
        )
        self.setup_targets()
        self.start()
        review = self.launch()
        self.assertEqual(review.prior_midyear_id, prior.id)
        self.assertEqual(review.comparison, {})
        url = f"/api/v1/reviews/{review.id}/manager-assessment/"
        client = self.acting(self.hr)
        def submit(content):
            return client.post(url, {"version": review.version, "content": content, "submit": True}, format="json")
        self.assertEqual(submit(self.content("MANAGER")).status_code, 400)
        self.submit(review, "EMPLOYEE")
        incomplete = self.content("MANAGER")
        del incomplete["pillars"]["context"]
        self.assertEqual(submit(incomplete).status_code, 400)
        incomplete = self.content("MANAGER")
        incomplete["overall"] = ""
        self.assertEqual(submit(incomplete).status_code, 400)
        self.submit(review, "MANAGER")
        self.assertEqual(workflow_status(review)["ai_coaching"], "Ready")
        with patch("apps.ai_coach.tasks.enqueue"), self.captureOnCommitCallbacks(execute=True):
            response = self.acting(self.nimal).post(
                f"/api/v1/reviews/{review.id}/ai-coaching/", {"version": review.version}, format="json")
        self.assertEqual(response.status_code, 202, response.data)
        self.agree_commitments(review)
        self.finish(review)
        self.assertEqual(review.state, "FINALISED")
        self.assertEqual(review.comparison, {})
        self.assertEqual(len(review.pillar_context), 5)
        prior.refresh_from_db()
        self.assertEqual(prior.state, "FINALISED")
        self.assertEqual(prior.snapshot.content, baseline)
        detail = self.acting(self.hr).get(f"/api/v1/reviews/{review.id}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["midyear_baseline"], baseline)

    def test_new_api_cycles_default_to_pillars_and_head_only(self):
        payload = {
            "year": 2027,
            "kind": "MID_YEAR",
            "starts_on": "2027-01-01",
            "ends_on": "2027-06-30",
            "due_on": "2027-07-01",
        }
        response = self.acting(self.hr).post("/api/v1/review-cycles/", payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["workflow_version"], 2)
        self.assertEqual(
            self.acting(self.nimal).post("/api/v1/review-cycles/", payload, format="json").status_code, 403
        )

    def test_ai_pillar_context_uses_locked_targets_and_all_submitted_accounts(self):
        self.setup_targets()
        self.start()
        review = self.launch()
        self.submit(review, "EMPLOYEE")
        self.submit(review, "MANAGER")
        # Simulate changed live rows: the formal-review snapshot remains authoritative.
        self.cycle.targets.update(target="Later target", success_measure="Later measure", notes="Later notes")
        payload = make_input(review)
        self.assertEqual(list(payload["pillar_reviews"]), PILLARS)
        for pillar, row in payload["pillar_reviews"].items():
            self.assertEqual(row, {
                "target": f"Target {pillar.upper()}", "success_measure": "Observable success",
                "expected_behaviour": "Expected behaviour", "employee_reflection": f"Reflection on {pillar}",
                "head_of_hr_appraisal": f"Assessment of {pillar}", "outcome": "Achieved", "steward_judgement": "Strong",
            })
        self.assertEqual([s["content"] for s in payload["sources"] if s["type"] == "EMPLOYEE_SUBMISSION"], [self.content("EMPLOYEE")])
        self.assertEqual([s["content"] for s in payload["sources"] if s["type"] == "MANAGER_SUBMISSION"], [self.content("MANAGER")])
        self.assertNotIn("conversation", str(payload).lower())
        self.assertNotIn("growth", str(payload).lower())

    def test_structured_coaching_cannot_write_human_pillar_or_overall_assessments(self):
        import json
        from unittest.mock import Mock

        from apps.ai_coach.services import request_analysis
        from apps.ai_coach.tasks import run_analysis

        self.setup_targets()
        self.start()
        review = self.launch()
        self.submit(review, "EMPLOYEE")
        self.submit(review, "MANAGER")
        before = deepcopy(review.hr_assessment)
        forms_before = list(review.submissions.values("id", "content"))
        analysis = request_analysis(self.nimal, review, review.version)
        source = analysis.input_snapshot["sources"][0]["id"]
        output = context_coaching({"strengths": [{"observation": "The reviewer reports achievement", "question": "What supported this?",
                  "source_ids": [source], "uncertainty": "Reported account"}], "gaps": [], "support_options": [], "limitations": []})
        with patch("apps.ai_coach.tasks.requests.post") as http:
            http.return_value = Mock(content=b"{}", json=lambda: {"status": "completed", "output": [
                {"type": "message", "content": [{"type": "output_text", "text": json.dumps(output)}]}]})
            run_analysis.run(str(analysis.id))
            sent = json.loads(http.call_args.kwargs["json"]["request"]["input"])
            self.assertEqual(sent["pillar_reviews"], analysis.input_snapshot["pillar_reviews"])
            self.assertIn("Targets are expectations, NOT evidence of achievement.", http.call_args.kwargs["json"]["request"]["instructions"])
        analysis.refresh_from_db()
        review.refresh_from_db()
        self.assertEqual(analysis.state, "SUCCEEDED")
        self.assertEqual(set(analysis.output["pillar_coaching"]), set(PILLARS))
        self.assertEqual(analysis.output, output)
        self.assertEqual(review.hr_assessment, before)
        self.assertEqual(list(review.submissions.values("id", "content")), forms_before)

    def test_individual_drafts_completion_audit_and_permissions(self):
        self.setup_targets(complete=False)
        self.start(expected=400)
        self.setup_targets(suffix=" improved")
        self.setup_targets(employee=self.sarah.profile, suffix=" different")
        self.assertEqual(self.cycle.targets.count(), 10)
        self.assertEqual(AuditLog.objects.filter(action="cycle.targets_saved").count(), 3)
        log = AuditLog.objects.filter(action="cycle.targets_saved").order_by("created_at")[1]
        self.assertNotEqual(log.metadata["before"][0]["target"], log.metadata["after"][0]["target"])
        target = self.cycle.targets.filter(employee=self.nimal.profile).first()
        for actor, status in [(self.nimal, 200), (self.sarah, 404), (self.foreign, 404)]:
            self.assertEqual(
                self.acting(actor).get(f"/api/v1/pillar-targets/{target.id}/").status_code, status
            )
        self.setup_targets(actor=self.nimal, expected=403)
        self.setup_targets(employee=self.foreign.profile, expected=400)
        self.start()
        self.setup_targets(suffix=" audited during cycle")

    def test_target_setup_rejects_duplicates_missing_values_and_stale_versions(self):
        self.setup_targets()
        rows = [
            {"pillar": p, "target": "Target", "success_measure": "Measure", "version": 0}
            for p in PillarTarget.Pillar.values
        ]
        url = f"/api/v1/review-cycles/{self.cycle.id}/targets/"
        response = self.acting(self.hr).post(
            url, {"employee": str(self.nimal.profile.id), "targets": rows, "complete": True}, format="json"
        )
        self.assertEqual(response.status_code, 409)
        rows[0]["pillar"] = rows[1]["pillar"]
        self.assertEqual(
            self.acting(self.hr)
            .post(url, {"employee": str(self.nimal.profile.id), "targets": rows}, format="json")
            .status_code,
            400,
        )

    def test_growth_stays_independent_private_and_shared(self):
        shared = self.growth()
        private = self.growth(shared=False)
        self.assertEqual(self.acting(self.hr).get(f"/api/v1/growth/{private.data['id']}/").status_code, 404)
        self.assertEqual(self.acting(self.hr).get(f"/api/v1/growth/{shared.data['id']}/").status_code, 200)
        self.setup_targets()
        self.start()
        review = self.launch()
        self.assertTrue(all("evidence" not in p for p in review.pillar_context))
        self.growth()

    def test_opening_requires_started_complete_targets(self):
        url = f"/api/v1/review-cycles/{self.cycle.id}/launch/"
        payload = {"employee_ids": [str(self.nimal.profile.id)], "reviewer_id": str(self.hr.id)}
        self.assertEqual(self.acting(self.hr).post(url, payload, format="json").status_code, 400)
        self.setup_targets()
        self.start()
        self.setup_targets(employee=self.sarah.profile, expected=400)
        self.launch()
        self.assertEqual(Review.objects.count(), 1)

    def test_full_pillar_workflow_sources_ai_and_immutable_final(self):
        self.setup_targets()
        self.start()
        entry = self.growth()
        review = self.launch()
        original = deepcopy(review.pillar_context)
        response = self.acting(self.nimal).patch(
            f"/api/v1/growth/{entry.data['id']}/", {"version": 1, "details": "Later work"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        review.refresh_from_db()
        self.assertEqual(review.pillar_context, original)
        response = self.acting(self.hr).post(
            f"/api/v1/reviews/{review.id}/manager-assessment/",
            {"version": review.version, "content": self.content("MANAGER"), "submit": True},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.submit(review, "EMPLOYEE")
        self.submit(review, "MANAGER")
        self.assertEqual(review.hr_assessment["overall"], "Strong Steward")
        self.assertEqual(self.acting(self.hr).post(
            f"/api/v1/reviews/{review.id}/pillar-evidence/", {}, format="json"
        ).status_code, 404)
        sources = make_input(review)["sources"]
        self.assertEqual(len([s for s in sources if s["type"] == "PILLAR_TARGET"]), 5)
        self.assertFalse(any(s["type"] == "VALIDATED_GROWTH_EVIDENCE" for s in sources))
        self.assertNotIn("evidence_url", str(sources))
        self.agree_commitments(review)
        self.assertTrue(workflow_status(review)["commitments_available"])
        self.finish(review)
        self.assertEqual(review.snapshot.content["pillar_context"], review.pillar_context)
        self.assertEqual(len(review.snapshot.content["pillar_context"]), 5)
        response = self.acting(self.hr).get(f"/api/v1/reviews/{review.id}/")
        self.assertEqual(response.data["state"], "FINALISED")
        self.assertEqual(response.data["snapshot"]["content"]["pillar_context"], review.pillar_context)
        self.setup_targets(expected=400)

    def test_reflection_and_appraisal_validate_all_pillars_and_outcomes(self):
        self.setup_targets()
        self.start()
        review = self.launch()
        self.submit(review, "EMPLOYEE")
        payload = self.content("MANAGER")
        payload["pillars"]["context"]["outcome"] = "Numeric 5"
        response = self.acting(self.hr).post(
            f"/api/v1/reviews/{review.id}/manager-assessment/",
            {"version": review.version, "submit": True, "content": payload},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        from rest_framework.exceptions import ValidationError

        from apps.reviews.schemas import TARGET_OUTCOMES, validate_pillar_form

        for outcome in TARGET_OUTCOMES:
            payload["pillars"]["context"]["outcome"] = outcome
            validate_pillar_form("MANAGER", payload)
        del payload["pillars"]["context"]
        with self.assertRaises(ValidationError):
            validate_pillar_form("MANAGER", payload)
