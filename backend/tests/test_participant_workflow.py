import json
from copy import deepcopy
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone

from apps.ai_coach.models import Analysis
from apps.ai_coach.services import make_input
from apps.reviews.models import FinalSnapshot

from . import test_reviews as fixture


@override_settings(
    N8N_WEBHOOK_URL="https://example.test/coach", N8N_WEBHOOK_TOKEN="test", OPENAI_MODEL="test"
)
class ParticipantWorkflowTests(TestCase):
    person = fixture.ReviewTests.person
    acting = fixture.ReviewTests.acting
    launch = fixture.ReviewTests.launch
    submit = fixture.ReviewTests.submit
    content = fixture.ReviewTests.content
    conversation = fixture.ReviewTests.conversation
    finish = fixture.ReviewTests.finish

    def setUp(self):
        fixture.ReviewTests.setUp(self)
        self.review = self.launch()

    def act(self, actor, action, expected=200, **payload):
        self.review.refresh_from_db()
        response = self.acting(actor).post(
            f"/api/v1/reviews/{self.review.id}/{action}/",
            {"version": self.review.version, **payload},
            format="json",
        )
        self.assertEqual(response.status_code, expected, response.data)
        self.review.refresh_from_db()
        return response

    def ready(self):
        self.submit(self.review, "EMPLOYEE")
        self.submit(self.review, "MANAGER")

    def stored_ai(self):
        return Analysis.objects.create(
            company=self.company,
            review=self.review,
            round=self.review.round,
            requested_by=self.hr,
            input_hash="old-output",
            input_snapshot=make_input(self.review),
            model="historical-model",
            state="SUCCEEDED",
            output={
                "strengths": [
                    {
                        "observation": "Existing coaching",
                        "question": "What helped?",
                        "source_ids": [],
                        "uncertainty": "Reported",
                    }
                ],
                "gaps": [],
                "support_options": [],
                "limitations": [],
            },
        )

    def plan(self, **changes):
        return {
            "owner": str(self.review.employee_id),
            "action": "Improve handover",
            "due_date": "2026-12-01",
            "success_measure": "Agreed outcome",
            "manager_support": "Time",
            **changes,
        }

    def status(self):
        return self.acting(self.nimal).get(f"/api/v1/reviews/{self.review.id}/").data["workflow"]

    def open_plan(self):
        self.ready()
        self.stored_ai()
        for actor in (self.nimal, self.sarah):
            self.act(actor, "conversation")

    def test_employee_ai_requires_both_forms_and_receives_full_contents(self):
        self.act(self.nimal, "ai-coaching", expected=400)
        self.submit(self.review, "EMPLOYEE")
        self.act(self.nimal, "ai-coaching", expected=400)
        self.assertEqual(self.status()["ai_coaching"], "Waiting for manager appraisal")
        self.submit(self.review, "MANAGER")
        with patch("apps.ai_coach.tasks.enqueue") as enqueue, self.captureOnCommitCallbacks(execute=True):
            self.act(self.nimal, "ai-coaching", expected=202)
        enqueue.assert_called_once()
        analysis = self.review.analyses.get()
        sources = {s["type"]: s["content"] for s in analysis.input_snapshot["sources"]}
        self.assertEqual(sources["EMPLOYEE_SUBMISSION"], self.content("EMPLOYEE"))
        self.assertEqual(sources["MANAGER_SUBMISSION"], self.content("MANAGER"))
        self.assertEqual(analysis.requested_by, self.nimal)
        self.assertEqual(self.status()["ai_coaching"], "Running")
        self.assertEqual(self.review.hr_assessment, {})
        for actor in (self.sarah, self.hr):
            self.act(actor, "ai-coaching", expected=403)

    def test_existing_ai_visible_to_participants_and_head_hr_not_unrelated_people(self):
        self.ready()
        stored = self.stored_ai()
        previous = deepcopy(stored.output)
        extra_head = self.person("independent-head", self.company, hr=True)
        for actor in (self.nimal, self.sarah, self.hr, extra_head):
            response = self.acting(actor).get(f"/api/v1/reviews/{self.review.id}/ai-coaching/")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["analyses"][0]["output"], previous)
        for actor in (self.kamal, self.foreign):
            self.assertEqual(
                self.acting(actor).get(f"/api/v1/reviews/{self.review.id}/ai-coaching/").status_code, 404
            )
        self.assertEqual(self.status()["ai_coaching"], "Complete")
        self.assertFalse(self.status()["conversation_complete"])
        self.act(self.nimal, "ai-coaching", expected=202)
        self.assertEqual(self.review.analyses.count(), 1)
        stored.refresh_from_db()
        self.assertEqual(stored.output, previous)

    def test_participation_is_owned_and_requires_ai(self):
        self.ready()
        self.act(self.nimal, "conversation", expected=400)
        self.stored_ai()
        self.act(self.hr, "conversation", expected=403)
        self.act(self.nimal, "conversation", expected=400, role="manager")
        self.act(self.nimal, "conversation")
        self.assertFalse(self.status()["conversation_complete"])
        self.assertNotIn("manager_participation", self.status()["confirmations"])
        self.act(self.nimal, "commitments", expected=400, commitment=self.plan())
        self.act(self.sarah, "conversation")
        self.assertTrue(self.status()["conversation_complete"])
        marks = self.status()["confirmations"]
        self.assertEqual(marks["employee_participation"]["actor"], str(self.nimal.id))
        self.assertEqual(marks["manager_participation"]["actor"], str(self.sarah.id))
        self.assertTrue(marks["employee_participation"]["at"])
        self.act(self.nimal, "conversation", expected=400)

    def test_plan_is_shared_edits_clear_agreement_and_both_confirmations_lock_it(self):
        self.open_plan()
        self.act(self.nimal, "confirm-commitments", expected=400)
        self.act(self.hr, "commitments", expected=403, commitment=self.plan())
        self.act(self.nimal, "commitments", commitment=self.plan())
        item = self.review.commitments.get()
        self.act(self.nimal, "confirm-commitments")
        self.assertFalse(self.status()["commitments_complete"])
        self.act(
            self.sarah, "commitments", commitment_id=str(item.id), commitment=self.plan(action="Shared edit")
        )
        self.assertNotIn("employee_commitments", self.status()["confirmations"])
        self.assertEqual(self.review.commitments.get().id, item.id)
        self.assertEqual(self.review.commitments.get().action, "Shared edit")
        self.act(self.nimal, "acknowledge", expected=400)
        for actor in (self.nimal, self.sarah):
            self.act(actor, "confirm-commitments")
        self.assertTrue(self.status()["commitments_complete"])
        self.act(self.sarah, "commitments", expected=400, commitment=self.plan())
        self.act(self.hr, "confirm-commitments", expected=403)
        self.act(
            self.nimal,
            "commitments",
            expected=400,
            commitment_id=str(item.id),
            commitment=self.plan(action="Overwrite"),
        )

    def test_acknowledgement_cannot_impersonate_and_hr_must_wait(self):
        self.ready()
        self.conversation(self.review)
        for actor, payload in ((self.nimal, {"manager_ack": True}), (self.sarah, {"employee_ack": True})):
            self.act(actor, "acknowledge", expected=400, **payload)
        self.act(self.hr, "acknowledge", expected=403)
        self.act(self.nimal, "acknowledge", comments="Reviewed; I disagree with one statement.")
        self.assertIsNone(self.review.manager_ack)
        response = self.act(self.hr, "complete", expected=400)
        self.assertIn("Manager acknowledgement", str(response.data))
        self.act(self.sarah, "acknowledge")
        self.act(self.sarah, "complete", expected=403)
        self.act(self.hr, "complete")
        self.assertEqual(self.review.state, "FINALISED")
        self.assertEqual(
            self.review.snapshot.content["employee_comments"], "Reviewed; I disagree with one statement."
        )
        before = deepcopy(self.review.snapshot.content)
        for actor, action, values in (
            (self.nimal, "conversation", {}),
            (self.sarah, "confirm-commitments", {}),
            (self.nimal, "commitments", {"commitment": self.plan()}),
            (self.nimal, "acknowledge", {}),
            (self.nimal, "ai-coaching", {}),
            (self.hr, "revision", {"reason": "Change"}),
            (
                self.hr,
                "human-assessment",
                {"assessment": {"overall": "Strong Steward", "rationale": "Change"}},
            ),
        ):
            self.act(actor, action, expected=400, **values)
        self.assertEqual(FinalSnapshot.objects.get(review=self.review).content, before)

    def test_finalisation_checks_all_stages_even_with_legacy_acknowledgements(self):
        self.ready()
        self.review.state = "ACKNOWLEDGEMENT_PENDING"
        self.review.employee_ack = self.review.manager_ack = timezone.now()
        self.review.save()
        response = self.act(self.hr, "complete", expected=400)
        for label in (
            "AI coaching",
            "Employee conversation participation",
            "Manager conversation participation",
            "Commitments confirmation",
        ):
            self.assertIn(label, str(response.data))

    def test_legacy_contents_and_acknowledgements_render_without_fabricated_confirmations(self):
        self.ready()
        self.stored_ai()
        self.review.conversation = {"discussion": "Historical discussion"}
        self.review.hr_assessment = {"overall": "Strong Steward", "rationale": "Original assessment"}
        self.review.employee_ack = timezone.now()
        self.review.state = "ACKNOWLEDGEMENT_PENDING"
        self.review.save()
        before = list(self.review.submissions.values("id", "content", "submitted_at"))
        for actor in (self.nimal, self.sarah, self.hr):
            response = self.acting(actor).get(f"/api/v1/reviews/{self.review.id}/")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(len(response.data["forms"]), 2)
            self.assertEqual(response.data["conversation"]["discussion"], "Historical discussion")
            self.assertTrue(response.data["employee_ack"])
            self.assertEqual(response.data["workflow"]["ai_coaching"], "Complete")
            self.assertFalse(response.data["workflow"]["conversation_complete"])
            self.assertFalse(response.data["workflow"]["commitments_complete"])
        self.assertEqual(list(self.review.submissions.values("id", "content", "submitted_at")), before)

    def test_revision_archives_all_prior_stage_data_and_keeps_commitment_ids(self):
        self.ready()
        self.conversation(self.review)
        self.act(self.nimal, "acknowledge", comments="Original perspective")
        old_marks = deepcopy(self.review.conversation)
        old_ids = list(self.review.commitments.values_list("id", flat=True))
        self.act(self.hr, "revision", reason="Clarify evidence")
        archive = json.loads(self.review.events.get(action="revision.archived").reason)
        self.assertEqual(archive["conversation"], old_marks)
        self.assertEqual(archive["employee_comments"], "Original perspective")
        self.assertTrue(archive["employee_ack"])
        self.assertEqual(list(self.review.commitments.values_list("id", flat=True)), old_ids)
        self.assertEqual(self.review.submissions.filter(round=1).count(), 2)
        self.assertEqual(self.review.analyses.count(), 1)
        self.assertFalse(self.status()["conversation_complete"])
        history = self.acting(self.hr).get(f"/api/v1/reviews/{self.review.id}/").data
        self.assertEqual(len(history["submission_history"]), 2)
        self.assertTrue(all(event["actor_id"] for event in history["history"]))

    def test_stale_version_cannot_confirm_an_edited_plan(self):
        self.open_plan()
        old_version = self.review.version
        self.act(self.nimal, "commitments", commitment=self.plan())
        response = self.acting(self.sarah).post(
            f"/api/v1/reviews/{self.review.id}/confirm-commitments/", {"version": old_version}, format="json"
        )
        self.assertEqual(response.status_code, 409)

    def test_historical_final_record_remains_final_without_new_confirmation_data(self):
        self.ready()
        self.stored_ai()
        old_snapshot = {
            "forms": [self.content("EMPLOYEE"), self.content("MANAGER")],
            "conversation": {"discussion": "Original final conversation"},
            "legacy": True,
        }
        FinalSnapshot.objects.create(
            company=self.company, review=self.review, content=old_snapshot, sha256="a" * 64
        )
        self.review.state = "FINALISED"
        self.review.finalised_at = timezone.now()
        self.review.save()
        response = self.acting(self.hr).get(f"/api/v1/reviews/{self.review.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["state"], "FINALISED")
        self.assertEqual(response.data["snapshot"]["content"], old_snapshot)
        self.assertEqual(response.data["workflow"]["ai_coaching"], "Complete")
        self.assertFalse(response.data["workflow"]["conversation_complete"])
        self.act(self.nimal, "conversation", expected=400)
        self.assertEqual(FinalSnapshot.objects.get(review=self.review).content, old_snapshot)
