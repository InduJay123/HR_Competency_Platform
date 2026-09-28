from datetime import date

from django.test import TestCase

from apps.reports.views import safe_cell
from apps.reviews.models import Review, ReviewCycle
from apps.reviews.services import launch_cycle

from . import test_reviews as fixture


class ExtendedWorkflowTests(TestCase):
    person = fixture.ReviewTests.person
    acting = fixture.ReviewTests.acting
    launch = fixture.ReviewTests.launch
    submit = fixture.ReviewTests.submit
    content = fixture.ReviewTests.content
    conversation = fixture.ReviewTests.conversation
    finish = fixture.ReviewTests.finish

    def setUp(self):
        fixture.ReviewTests.setUp(self)

    def final_midyear(self):
        r = self.launch()
        self.submit(r, "EMPLOYEE")
        self.submit(r, "MANAGER")
        self.conversation(r)
        self.finish(r)
        return r

    def year_end(self, prior):
        cycle = ReviewCycle.objects.create(
            company=self.company,
            year=2026,
            kind="YEAR_END",
            starts_on=date(2026, 7, 1),
            ends_on=date(2026, 12, 31),
            due_on=date(2027, 1, 15),
        )
        launch_cycle(self.hr, cycle, [self.nimal.profile.id], self.hr.id)
        return Review.objects.get(cycle=cycle)

    def test_yearend_requires_all_commitment_outcomes_and_preserves_baseline(self):
        prior = self.final_midyear()
        baseline = prior.snapshot.content
        end = self.year_end(prior)
        blocked = self.acting(self.sarah).post(
            f"/api/v1/reviews/{end.id}/manager-assessment/",
            {"version": end.version, "content": self.content("MANAGER"), "submit": True},
            format="json",
        )
        self.assertEqual(blocked.status_code, 400)
        for c in baseline["commitments"]:
            result = self.acting(self.sarah).post(
                f"/api/v1/reviews/{end.id}/comparison/",
                {
                    "version": end.version,
                    "commitment_id": c["id"],
                    "outcome": "PARTIALLY_MET",
                    "rationale": "Progress and remaining support documented.",
                },
                format="json",
            )
            self.assertEqual(result.status_code, 200, result.data)
            end.refresh_from_db()
        self.submit(end, "MANAGER")
        self.submit(end, "EMPLOYEE")
        self.conversation(end)
        self.finish(end)
        prior.refresh_from_db()
        self.assertEqual(prior.snapshot.content, baseline)
        self.assertEqual(len(end.snapshot.content["midyear_comparison"]), 3)

    def test_comparison_draft_is_private_to_manager(self):
        prior = self.final_midyear()
        end = self.year_end(prior)
        c = prior.snapshot.content["commitments"][0]
        self.acting(self.sarah).post(
            f"/api/v1/reviews/{end.id}/comparison/",
            {
                "version": end.version,
                "commitment_id": c["id"],
                "outcome": "MISSED",
                "rationale": "Private draft",
            },
            format="json",
        )
        self.assertEqual(
            self.acting(self.nimal).get(f"/api/v1/reviews/{end.id}/comparison/").data["outcomes"], {}
        )

    def test_development_work_link_is_idempotent(self):
        r = self.final_midyear()
        c = r.commitments.first()
        client = self.acting(self.sarah)
        one = client.post(f"/api/v1/development/{c.id}/create-work/", {}, format="json")
        two = client.post(f"/api/v1/development/{c.id}/create-work/", {}, format="json")
        self.assertEqual(one.status_code, 201, one.data)
        self.assertEqual(one.data, two.data)
        c.refresh_from_db()
        self.assertEqual(c.work_item.type, "DEVELOPMENT")

    def test_employee_cannot_escalate_profile_role_or_joining_date(self):
        self.nimal.profile.refresh_from_db()
        result = self.acting(self.nimal).patch(
            "/api/v1/auth/profile/",
            {
                "version": self.nimal.profile.version,
                "first_name": "Updated",
                "is_hr": True,
                "joined_on": "2003-01-01",
            },
            format="json",
        )
        self.assertEqual(result.status_code, 200, result.data)
        self.nimal.refresh_from_db()
        self.nimal.profile.refresh_from_db()
        self.assertFalse(self.nimal.is_hr)
        self.assertIsNone(self.nimal.profile.joined_on)

    def test_hr_report_and_csv_are_role_and_tenant_scoped(self):
        self.launch()
        self.assertEqual(self.acting(self.nimal).get("/api/v1/reports/overview/?scope=hr").status_code, 403)
        self.assertEqual(self.acting(self.nimal).get("/api/v1/reports/reviews.csv").status_code, 403)
        self.assertEqual(
            self.acting(self.hr).get("/api/v1/reports/overview/?scope=hr").data["reviews"]["total"], 1
        )
        self.assertEqual(
            self.acting(self.foreign).get("/api/v1/reports/overview/?scope=manager").data["reviews"]["total"],
            0,
        )
        self.assertEqual(safe_cell("=CMD()"), "'=CMD()")
        self.assertEqual(self.acting(self.hr).get("/api/v1/reports/reviews.csv/").status_code, 200)

    def test_development_progress_permissions_and_history(self):
        review = self.final_midyear()
        commitment = review.commitments.first()
        url = f"/api/v1/development/{commitment.id}/"
        employee = self.acting(self.nimal)
        self.assertTrue(employee.get(url).data["can_update"])
        self.assertFalse(employee.get(url).data["can_create_work"])
        response = employee.post(
            url + "progress/",
            {
                "version": commitment.version,
                "status": "SUPPORT_NEEDED",
                "notes": "Synthetic follow-up: need protected practice time.",
                "evidence_ids": [],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(employee.get(url + "history/").data), 1)
        self.assertEqual(
            self.acting(self.hr)
            .post(
                url + "progress/",
                {"version": response.data["version"], "status": "COMPLETE", "notes": "No permission"},
                format="json",
            )
            .status_code,
            403,
        )

    def test_senior_appraisal_requires_strategic_context(self):
        self.nimal.profile.senior_leader = True
        self.nimal.profile.save()
        r = self.launch()
        result = self.acting(self.sarah).post(
            f"/api/v1/reviews/{r.id}/manager-assessment/",
            {"version": 1, "content": self.content("MANAGER"), "submit": True},
            format="json",
        )
        self.assertEqual(result.status_code, 400)

    def test_hr_cannot_deactivate_current_review_participant(self):
        self.launch()
        p = self.nimal.profile
        p.refresh_from_db()
        result = self.acting(self.hr).patch(
            f"/api/v1/employees/{p.id}/", {"version": p.version, "active": False}, format="json"
        )
        self.assertEqual(result.status_code, 400)
