from datetime import timedelta
from uuid import uuid4

from django.test import TestCase
from django.utils import timezone

from apps.ai_coach.models import Analysis

from . import test_reviews as fixture


class AcceptedCoachingTests(TestCase):
    person = fixture.ReviewTests.person
    acting = fixture.ReviewTests.acting
    launch = fixture.ReviewTests.launch

    def setUp(self):
        fixture.ReviewTests.setUp(self)
        self.review = self.launch()
        self.url = f"/api/v1/reviews/{self.review.id}/accepted-coaching/"

    def analysis(self, **overrides):
        sources = [
            {"id": str(uuid4()), "type": kind, "content": "private source content"}
            for kind in ("EMPLOYEE_SUBMISSION", "MANAGER_SUBMISSION", "VALIDATED_EVIDENCE")
        ]
        values = dict(
            company=self.company, review=self.review, requested_by=self.hr,
            round=self.review.round, input_hash=uuid4().hex,
            input_snapshot={"sources": sources}, model="private-model",
            state="SUCCEEDED", decision="ACCEPTED", reviewed_at=timezone.now(),
            decision_notes="private decision", provider_response_id="private-provider",
            error_code="private-error",
            output={
                "strengths": [{
                    "observation": "A reported outcome",
                    "source_ids": [source["id"] for source in sources],
                    "question": "What helped?", "uncertainty": "Reported claim",
                    "internal": "must not leak",
                }],
                "gaps": [], "support_options": [], "limitations": ["Limited evidence"],
                "internal": "must not leak",
            },
        )
        values.update(overrides)
        return Analysis.objects.create(**values)

    def test_own_current_accepted_coaching_is_safe(self):
        analysis = self.analysis()
        response = self.acting(self.nimal).get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), {"available", "coaching", "reviewed_at", "sources"})
        self.assertTrue(response.data["available"])
        self.assertEqual(response.data["reviewed_at"], analysis.reviewed_at)
        self.assertEqual(set(response.data["coaching"]), {
            "strengths", "gaps", "support_options", "limitations",
        })
        self.assertEqual(set(response.data["coaching"]["strengths"][0]), {
            "observation", "source_ids", "question", "uncertainty",
        })
        self.assertEqual(set(response.data["sources"].values()), {
            "Employee reflection", "Manager appraisal", "Validated evidence",
        })
        self.assertNotIn("private", response.content.decode())
        self.assertNotIn("must not leak", response.content.decode())

    def test_other_people_and_tenants_cannot_read(self):
        self.analysis()
        for actor in (self.kamal, self.sarah, self.hr, self.foreign):
            with self.subTest(actor=actor.pk):
                self.assertEqual(self.acting(actor).get(self.url).status_code, 404)

    def test_authentication_and_active_membership_required(self):
        self.assertEqual(self.client.get(self.url).status_code, 403)
        client = self.acting(self.nimal)
        self.nimal.active = False
        self.nimal.save()
        self.assertEqual(client.get(self.url).status_code, 403)

    def test_unavailable_without_accepted_analysis(self):
        response = self.acting(self.nimal).get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"available": False, "coaching": None})

    def test_ineligible_analyses_are_not_returned(self):
        for overrides in (
            {"decision": "REJECTED"}, {"decision": ""}, {"state": "FAILED"},
            {"state": "QUEUED"}, {"state": "RUNNING"},
            {"round": self.review.round + 1}, {"company": self.other},
        ):
            with self.subTest(overrides=overrides):
                analysis = self.analysis(**overrides)
                response = self.acting(self.nimal).get(self.url)
                self.assertEqual(response.data, {"available": False, "coaching": None})
                analysis.delete()

    def test_latest_acceptance_wins_and_previous_round_is_hidden(self):
        latest = self.analysis()
        self.analysis(reviewed_at=timezone.now() - timedelta(days=1))
        self.assertEqual(self.acting(self.nimal).get(self.url).data["reviewed_at"], latest.reviewed_at)
        self.review.round += 1
        self.review.save()
        self.assertEqual(self.acting(self.nimal).get(self.url).data, {
            "available": False, "coaching": None,
        })

    def test_employee_cannot_mutate_coaching(self):
        analysis = self.analysis()
        client = self.acting(self.nimal)
        self.assertEqual(client.post(self.url, {}, format="json").status_code, 405)
        for action, payload in (
            ("ai-decision", {"analysis_id": str(analysis.pk), "decision": "REJECTED", "notes": "No"}),
        ):
            self.assertEqual(client.post(
                f"/api/v1/reviews/{self.review.id}/{action}/", payload, format="json"
            ).status_code, 403)
        self.assertEqual(client.get(
            f"/api/v1/reviews/{self.review.id}/ai-coaching/"
        ).status_code, 200)
