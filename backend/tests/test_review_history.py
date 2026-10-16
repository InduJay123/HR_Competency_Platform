from copy import deepcopy
from datetime import date

from django.test import TestCase
from django.utils import timezone

from apps.development.models import Commitment
from apps.reviews.models import FinalSnapshot, Review, ReviewCycle
from apps.reviews.schemas import PILLARS

from . import test_foundation as fixtures


class ReviewHistoryTests(TestCase):
    person = fixtures.FoundationTests.person
    acting = fixtures.FoundationTests.acting

    def setUp(self):
        fixtures.FoundationTests.setUp(self)

    def record(
        self, kind="MID_YEAR", year=2026, person=None, state="FINALISED", outcome="Partially achieved"
    ):
        person = person or self.nimal
        cycle, _ = ReviewCycle.objects.get_or_create(
            company=person.company,
            year=year,
            kind=kind,
            defaults={
                "starts_on": date(year, 1, 1),
                "ends_on": date(year, 12, 31),
                "due_on": date(year, 12, 31),
            },
        )
        r = Review.objects.create(
            company=person.company,
            employee=person.profile,
            manager=self.hr.profile,
            reviewer=self.hr,
            cycle=cycle,
            state=state,
            finalised_at=timezone.now() if state == "FINALISED" else None,
            hr_assessment={"overall": "Live changed value", "rationale": "Live changed summary"},
        )
        if state == "FINALISED":
            FinalSnapshot.objects.create(
                company=person.company,
                review=r,
                sha256="a" * 64,
                content={
                    "hr_assessment": {
                        "overall": "Developing Steward" if kind == "MID_YEAR" else "Strong Steward",
                        "rationale": f"{kind} human summary",
                    },
                    "pillar_context": [
                        {
                            "pillar": p.upper(),
                            "target": f"{p} original target",
                            "success_measure": "Agreed measure",
                        }
                        for p in PILLARS
                    ],
                    "forms": [
                        {
                            "kind": "MANAGER",
                            "submitted_at": "2026-07-01",
                            "content": {
                                "pillars": {
                                    p: {
                                        "outcome": outcome,
                                        "descriptor": "Strong",
                                        "narrative": "Human appraisal",
                                    }
                                    for p in PILLARS
                                }
                            },
                        },
                        {
                            "kind": "EMPLOYEE",
                            "submitted_at": "2026-07-01",
                            "content": {"pillars": {p: "Personal reflection" for p in PILLARS}},
                        },
                    ],
                    "commitments": [],
                    "ai_history": [{"output": {"rating": "AI MUST NOT APPEAR"}}],
                },
            )
        return r

    def get(self, member=None, **query):
        return self.acting(member or self.nimal).get("/api/v1/review-history/", query)

    def test_personal_scope_and_chief_selection(self):
        self.record()
        self.record(person=self.kamal)
        response = self.get()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["person"]["id"], str(self.nimal.profile.id))
        self.assertEqual(len(response.data["history"]), 1)
        self.assertEqual(self.get(employee_id=str(self.kamal.profile.id)).status_code, 403)
        self.assertEqual(self.get(self.hr, employee_id=str(self.kamal.profile.id)).status_code, 200)
        self.assertEqual(self.get(self.hr, employee_id=str(self.foreign.profile.id)).status_code, 404)
        self.assertEqual(self.client.get("/api/v1/review-history/").status_code, 403)

    def test_person_selector_is_chief_only_and_company_scoped(self):
        url = "/api/v1/review-history/people/"
        self.assertEqual(self.acting(self.nimal).get(url).status_code, 403)
        data = self.acting(self.hr).get(url).data
        ids = {p["id"] for p in data["results"]}
        self.assertIn(str(self.nimal.profile.id), ids)
        self.assertNotIn(str(self.foreign.profile.id), ids)
        self.assertNotIn(str(self.hr.profile.id), ids)
        self.assertEqual(self.acting(self.hr).get(url, {"search": "nimal"}).data["count"], 1)
        admin = self.person("ordinaryhr", self.company)
        admin.is_hr = True
        admin.save()
        self.assertEqual(self.acting(admin).get(url).status_code, 403)
        self.assertEqual(self.get(admin, employee_id=str(self.nimal.profile.id)).status_code, 403)

    def test_years_pairing_and_human_snapshot_fields(self):
        mid = self.record()
        end = self.record("YEAR_END", outcome="Achieved")
        old = self.record(year=2025)
        self.record(year=2024, person=self.kamal)
        self.record(year=2023, person=self.foreign)
        data = self.get().data
        self.assertEqual(data["available_years"], [2026, 2025])
        self.assertEqual(data["selected_year"], 2026)
        self.assertEqual(data["mid_year"]["id"], str(mid.id))
        self.assertEqual(data["year_end"]["id"], str(end.id))
        self.assertEqual(data["overall_progress"], "Changed from Developing Steward to Strong Steward")
        self.assertEqual(data["mid_year"]["summary"], "MID_YEAR human summary")
        self.assertEqual([p["pillar"] for p in data["pillar_comparison"]], PILLARS)
        self.assertTrue(all(p["progress"] == "Improved" for p in data["pillar_comparison"]))
        self.assertEqual(data["pillar_comparison"][0]["mid_year"]["target"], "context original target")
        self.assertEqual(data["pillar_comparison"][0]["mid_year"]["appraisal"], "Human appraisal")
        self.assertNotIn("AI MUST NOT APPEAR", str(data))
        self.assertNotIn("Live changed", str(data))
        data = self.get(year=2025).data
        self.assertEqual(data["mid_year"]["id"], str(old.id))
        self.assertIsNone(data["year_end"])

    def test_missing_reviews_and_empty_history(self):
        self.assertEqual(self.get().data["available_years"], [])
        self.record("YEAR_END")
        data = self.get().data
        self.assertIsNone(data["mid_year"])
        self.assertEqual(data["overall_progress"], "Not comparable")
        self.assertEqual(data["commitments"], [])
        self.assertEqual(self.get(year="bad").status_code, 400)
        self.assertEqual(self.get(employee_id="bad").status_code, 400)

    def test_incomplete_records_expose_metadata_only(self):
        self.record()
        end = self.record("YEAR_END", state="SUBMITTED")
        end.pillar_context = [{"target": "Draft secret"}]
        end.save()
        data = self.get().data
        self.assertEqual(data["year_end"]["state"], "SUBMITTED")
        self.assertEqual(data["year_end"]["overall"], "")
        self.assertEqual(data["year_end"]["pillars"], [])
        self.assertEqual(data["overall_progress"], "Not comparable")
        self.assertNotIn("Draft secret", str(data))
        self.assertNotIn("Live changed", str(data))

    def test_outcome_progression_and_unranked_judgements(self):
        from apps.reviews.history import progression

        self.assertEqual(progression("Achieved", "Exceeded", True), "Improved")
        self.assertEqual(progression("Achieved", "Achieved", True), "Sustained")
        self.assertEqual(progression("Achieved", "Not achieved", True), "Declined")
        self.assertEqual(progression("", "Achieved", True), "Not comparable")
        self.assertEqual(progression("Developing", "Strong"), "Changed from Developing to Strong")
        self.assertEqual(progression("Unknown", "Achieved", True), "Changed from Unknown to Achieved")

    def test_commitments_use_explicit_relationship_and_separate_current_status(self):
        mid = self.record()
        end = self.record("YEAR_END")
        commitment = Commitment.objects.create(
            company=self.company,
            review=mid,
            employee=self.nimal.profile,
            owner=self.nimal.profile,
            action="Current action",
            success_measure="Current measure",
            manager_support="Support",
            due_date=date(2026, 12, 1),
            status="COMPLETE",
        )
        snapshot = mid.snapshot
        snapshot.content["commitments"] = [
            {
                "id": str(commitment.id),
                "owner_id": str(self.nimal.profile.id),
                "action": "Original action",
                "success_measure": "Original measure",
                "manager_support": "Agreed support",
                "due_date": "2026-11-01",
            }
        ]
        snapshot.save()
        snapshot = end.snapshot
        snapshot.content["midyear_comparison"] = {
            str(commitment.id): {"outcome": "PARTIAL", "rationale": "Recorded Year-End explanation"}
        }
        snapshot.save()
        data = self.get().data["commitments"][0]
        self.assertEqual(data["action"], "Original action")
        self.assertEqual(data["current_status"], "Complete")
        self.assertEqual(data["year_end_outcome"], "")
        end.prior_midyear = mid
        end.save()
        before = deepcopy(mid.snapshot.content)
        data = self.get().data["commitments"][0]
        self.assertEqual(data["year_end_outcome"], "PARTIAL")
        self.assertEqual(data["year_end_rationale"], "Recorded Year-End explanation")
        self.assertEqual(data["owner"], "Nimal Test")
        mid.snapshot.refresh_from_db()
        self.assertEqual(mid.snapshot.content, before)

    def test_finalised_legacy_record_without_snapshot_is_labelled(self):
        r = self.record()
        r.snapshot.delete()
        data = self.get().data
        self.assertEqual(data["mid_year"]["source"], "Finalised review fields (snapshot unavailable)")
        self.assertEqual(data["mid_year"]["overall"], "Live changed value")
        self.assertEqual(data["pillar_comparison"][0]["progress"], "Not comparable")

    def test_existing_final_record_endpoint_remains_accessible(self):
        review = self.record()
        for member in [self.nimal, self.hr]:
            response = self.acting(member).get(f"/api/v1/reviews/{review.id}/")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["state"], "FINALISED")

    def test_more_historical_years_do_not_add_per_record_queries(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        self.record()
        client = self.acting(self.nimal)
        with CaptureQueriesContext(connection) as before:
            client.get("/api/v1/review-history/")
        for year in range(2018, 2026):
            self.record(year=year)
        with CaptureQueriesContext(connection) as after:
            response = client.get("/api/v1/review-history/")
        self.assertEqual(len(before), len(after))
        self.assertEqual(len(response.data["available_years"]), 9)
