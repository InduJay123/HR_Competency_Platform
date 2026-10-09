from datetime import date

from django.db import DatabaseError, connection, transaction
from django.test import TestCase

from apps.development.models import Commitment
from apps.reviews.models import FinalSnapshot, Review, ReviewCycle
from apps.reviews.schemas import PILLARS

from . import test_foundation as fixture


class ReviewTests(TestCase):
    person = fixture.FoundationTests.person
    acting = fixture.FoundationTests.acting

    def setUp(self):
        fixture.FoundationTests.setUp(self)
        self.cycle = ReviewCycle.objects.create(
            company=self.company,
            year=2026,
            kind="MID_YEAR",
            starts_on=date(2026, 1, 1),
            ends_on=date(2026, 6, 30),
            due_on=date(2026, 7, 15),
        )

    def launch(self):
        r = self.acting(self.hr).post(
            f"/api/v1/review-cycles/{self.cycle.id}/launch/",
            {"employee_ids": [str(self.nimal.profile.id)], "reviewer_id": str(self.hr.id)},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.data)
        return Review.objects.get(cycle=self.cycle)

    def content(self, kind):
        if kind == "EMPLOYEE":
            return {
                **{
                    k: "Evidence-led reflection"
                    for k in [
                        "outcomes",
                        "results",
                        "contributions",
                        "capability",
                        "legacy",
                        "barriers",
                        "support",
                        "prior_progress",
                    ]
                },
                "pillars": {p: "Context and evidence" for p in PILLARS},
            }
        return {
            **{
                k: "Human assessment rationale"
                for k in [
                    "rationale",
                    "contributions",
                    "prior_progress",
                    "next_success",
                    "strengths",
                    "gaps",
                    "knowledge",
                    "people",
                    "systems",
                    "summary",
                    "ecp_contribution",
                    "ecp_potential",
                    "development_actions",
                    "relationships",
                ]
            },
            "ecp": "Stars",
            "overall": "Strong Steward",
            "pillars": {p: {"narrative": "Evidence and context", "descriptor": "Strong"} for p in PILLARS},
        }

    def submit(self, review, kind):
        review.refresh_from_db()
        actor = self.nimal if kind == "EMPLOYEE" else self.sarah
        action = "employee-reflection" if kind == "EMPLOYEE" else "manager-assessment"
        result = self.acting(actor).post(
            f"/api/v1/reviews/{review.id}/{action}/",
            {"version": review.version, "content": self.content(kind), "submit": True},
            format="json",
        )
        self.assertEqual(result.status_code, 200, result.data)
        review.refresh_from_db()

    def conversation(self, review):
        from uuid import uuid4

        from apps.ai_coach.models import Analysis
        from apps.ai_coach.services import make_input

        review.refresh_from_db()
        Analysis.objects.create(company=self.company, review=review, round=review.round,
            requested_by=self.nimal, input_hash=uuid4().hex, input_snapshot=make_input(review),
            model="test", state="SUCCEEDED", output={"strengths": [], "gaps": [],
                "support_options": [], "limitations": ["Test coaching"]})

        def act(actor, action, **values):
            review.refresh_from_db()
            response = self.acting(actor).post(f"/api/v1/reviews/{review.id}/{action}/",
                {"version": review.version, **values}, format="json")
            self.assertEqual(response.status_code, 200, response.data)

        for actor in (self.nimal, self.sarah):
            act(actor, "conversation")
        for i in range(3):
            act(self.nimal, "commitments", commitment={
                "owner": str(self.nimal.profile.id), "action": f"Action {i}",
                "manager_support": "Protected time", "success_measure": "Agreed outcome",
                "due_date": "2026-12-01"})
        act(self.hr, "human-assessment", assessment={"overall": "Strong Steward", "rationale": "Human-led assessment."})
        for actor in (self.nimal, self.sarah):
            act(actor, "confirm-commitments")
        review.refresh_from_db()

    def finish(self, review):
        for actor in [self.nimal, self.sarah]:
            r = self.acting(actor).post(
                f"/api/v1/reviews/{review.id}/acknowledge/", {"version": review.version}, format="json"
            )
            self.assertEqual(r.status_code, 200, r.data)
            review.refresh_from_db()
        r = self.acting(self.hr).post(
            f"/api/v1/reviews/{review.id}/complete/", {"version": review.version}, format="json"
        )
        self.assertEqual(r.status_code, 200, r.data)
        review.refresh_from_db()

    def test_midyear_to_yearend(self):
        review = self.launch()
        self.submit(review, "MANAGER")
        self.submit(review, "EMPLOYEE")
        self.assertEqual(review.state, "SUBMITTED")
        self.conversation(review)
        self.finish(review)
        before = FinalSnapshot.objects.get(review=review).content
        c = Commitment.objects.filter(review=review).first()
        result = self.acting(self.nimal).post(
            f"/api/v1/development/{c.id}/progress/",
            {"version": 1, "status": "IN_PROGRESS", "notes": "Progress after review"},
            format="json",
        )
        self.assertEqual(result.status_code, 200)
        self.assertEqual(FinalSnapshot.objects.get(review=review).content, before)
        end = ReviewCycle.objects.create(
            company=self.company,
            year=2026,
            kind="YEAR_END",
            starts_on=date(2026, 7, 1),
            ends_on=date(2026, 12, 31),
            due_on=date(2027, 1, 10),
        )
        r = self.acting(self.hr).post(
            f"/api/v1/review-cycles/{end.id}/launch/",
            {"employee_ids": [str(self.nimal.profile.id)], "reviewer_id": str(self.hr.id)},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(Review.objects.get(cycle=end).prior_midyear, review)

    def test_submitted_form_cannot_be_overwritten(self):
        r = self.launch()
        self.submit(r, "EMPLOYEE")
        result = self.acting(self.nimal).post(
            f"/api/v1/reviews/{r.id}/employee-reflection/",
            {"version": r.version, "content": {"outcomes": "Changed"}},
            format="json",
        )
        self.assertEqual(result.status_code, 400)

    def test_private_manager_draft_not_disclosed(self):
        r = self.launch()
        self.acting(self.sarah).post(
            f"/api/v1/reviews/{r.id}/manager-assessment/",
            {"version": r.version, "content": {"summary": "Private draft"}},
            format="json",
        )
        result = self.acting(self.nimal).get(f"/api/v1/reviews/{r.id}/")
        self.assertEqual(result.data["forms"], [])

    def test_manager_submission_shared_after_both_submit_before_conversation(self):
        r = self.launch()
        self.submit(r, "MANAGER")
        self.assertEqual(self.acting(self.nimal).get(f"/api/v1/reviews/{r.id}/").data["forms"], [])
        self.submit(r, "EMPLOYEE")
        forms = self.acting(self.nimal).get(f"/api/v1/reviews/{r.id}/").data["forms"]
        self.assertEqual({f["kind"] for f in forms}, {"EMPLOYEE", "MANAGER"})

    def test_employee_comments_preserved_and_cannot_be_replaced_by_manager(self):
        r = self.launch()
        self.submit(r, "EMPLOYEE")
        self.submit(r, "MANAGER")
        self.conversation(r)
        url = f"/api/v1/reviews/{r.id}/acknowledge/"
        denied = self.acting(self.sarah).post(
            url, {"version": r.version, "comments": "Forged employee perspective"}, format="json"
        )
        self.assertEqual(denied.status_code, 403)
        response = self.acting(self.nimal).post(
            url,
            {"version": r.version, "comments": "I participated but disagree with the stated outcome."},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        r.refresh_from_db()
        second = self.acting(self.nimal).post(
            url, {"version": r.version, "comments": "Overwrite"}, format="json"
        )
        self.assertEqual(second.status_code, 400)
        self.assertEqual(
            self.acting(self.sarah).post(url, {"version": r.version}, format="json").status_code, 200
        )
        r.refresh_from_db()
        result = self.acting(self.hr).post(
            f"/api/v1/reviews/{r.id}/complete/", {"version": r.version}, format="json"
        )
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(
            r.snapshot.content["employee_comments"], "I participated but disagree with the stated outcome."
        )

    def test_cross_tenant_review_hidden(self):
        r = self.launch()
        self.assertEqual(self.acting(self.foreign).get(f"/api/v1/reviews/{r.id}/").status_code, 404)

    def test_manager_cannot_finalise(self):
        r = self.launch()
        result = self.acting(self.sarah).post(
            f"/api/v1/reviews/{r.id}/complete/", {"version": r.version}, format="json"
        )
        self.assertEqual(result.status_code, 403)

    def test_hr_cannot_skip_acknowledgement(self):
        r = self.launch()
        self.submit(r, "EMPLOYEE")
        self.submit(r, "MANAGER")
        self.conversation(r)
        result = self.acting(self.hr).post(
            f"/api/v1/reviews/{r.id}/complete/", {"version": r.version}, format="json"
        )
        self.assertEqual(result.status_code, 400)

    def test_revision_preserves_old_form_and_resets_ack(self):
        r = self.launch()
        self.submit(r, "EMPLOYEE")
        self.submit(r, "MANAGER")
        self.conversation(r)
        result = self.acting(self.hr).post(
            f"/api/v1/reviews/{r.id}/revision/",
            {"version": r.version, "reason": "Add missing context"},
            format="json",
        )
        self.assertEqual(result.status_code, 200)
        r.refresh_from_db()
        self.assertEqual(r.round, 2)
        self.assertEqual(r.submissions.filter(round=1, submitted_at__isnull=False).count(), 2)
        self.assertIsNone(r.employee_ack)

    def test_nonstandard_cycle_rejected(self):
        data = {
            "year": 2026,
            "kind": "QUARTERLY",
            "starts_on": "2026-01-01",
            "ends_on": "2026-03-31",
            "due_on": "2026-04-15",
        }
        self.assertEqual(
            self.acting(self.hr).post("/api/v1/review-cycles/", data, format="json").status_code, 400
        )

    def test_malformed_form_is_validation_error(self):
        r = self.launch()
        body = {"version": r.version, "content": {"ecp": "Stars", "pillars": []}, "submit": True}
        self.assertEqual(
            self.acting(self.sarah)
            .post(f"/api/v1/reviews/{r.id}/manager-assessment/", body, format="json")
            .status_code,
            400,
        )

    def test_postgres_snapshot_guard(self):
        if connection.vendor != "postgresql":
            self.skipTest("PostgreSQL trigger integration test")
        r = self.launch()
        self.submit(r, "EMPLOYEE")
        self.submit(r, "MANAGER")
        self.conversation(r)
        self.finish(r)
        with self.assertRaises(DatabaseError), transaction.atomic():
            FinalSnapshot.objects.filter(review=r).update(content={"tampered": True})
