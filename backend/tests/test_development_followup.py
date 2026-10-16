from datetime import date, timedelta
from unittest.mock import patch

from django.test import TestCase

from apps.development.models import Commitment
from apps.evidence.models import EvidenceItem
from apps.organisation.models import Department
from apps.reviews.models import Review, ReviewCycle
from apps.tasks.models import WorkItem

from . import test_foundation as fixtures


class DevelopmentFollowUpTests(TestCase):
    person = fixtures.FoundationTests.person
    acting = fixtures.FoundationTests.acting

    def setUp(self):
        fixtures.FoundationTests.setUp(self)
        self.today = date(2026, 10, 16)
        self.department = Department.objects.create(company=self.company, name="Finance")
        profile = self.nimal.profile
        profile.department = self.department
        profile.designation = "Analyst"
        profile.photo_url = "https://example.test/photo.png"
        profile.save()
        self.patch = patch("apps.development.views.timezone.localdate", return_value=self.today)
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def commitment(self, member=None, status="NOT_STARTED", due=None, action="Improve handover", owner=None):
        member = member or self.nimal
        cycle, _ = ReviewCycle.objects.get_or_create(
            company=member.company,
            year=2026,
            kind="MID_YEAR",
            defaults={
                "starts_on": date(2026, 1, 1),
                "ends_on": date(2026, 6, 30),
                "due_on": date(2026, 7, 1),
            },
        )
        review, _ = Review.objects.get_or_create(
            company=member.company,
            cycle=cycle,
            employee=member.profile,
            defaults={"manager": self.hr.profile, "reviewer": self.hr, "state": "FINALISED"},
        )
        return Commitment.objects.create(
            company=member.company,
            review=review,
            employee=member.profile,
            owner=(owner or member).profile,
            action=action,
            manager_support="Original support text",
            success_measure="Agreed measure",
            due_date=due or self.today - timedelta(days=1),
            status=status,
        )

    def listing(self, **params):
        response = self.acting(self.hr).get("/api/v1/development/", params)
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def test_identity_and_owner_are_distinct_and_tenant_scoped(self):
        item = self.commitment(owner=self.hr)
        self.commitment(self.foreign)
        result = self.listing()
        self.assertEqual(result["count"], 1)
        row = result["results"][0]
        self.assertEqual(
            row["employee_details"],
            {
                "id": str(self.nimal.profile.id),
                "name": "Nimal Test",
                "designation": "Analyst",
                "department": "Finance",
                "photo_url": "https://example.test/photo.png",
            },
        )
        self.assertEqual(row["owner_name"], "Head Test")
        self.assertEqual(str(row["owner"]), str(self.hr.profile.id))
        self.assertEqual(str(row["review"]), str(item.review_id))

    def test_filters_and_filtered_summary(self):
        self.commitment(status="SUPPORT_NEEDED")
        self.commitment(status="COMPLETE")
        self.commitment(self.kamal, status="IN_PROGRESS", action="Share risk analytics")
        self.assertEqual(self.listing(employee=str(self.nimal.profile.id))["count"], 2)
        self.assertEqual(self.listing(department=str(self.department.id))["count"], 2)
        result = self.listing(status="SUPPORT_NEEDED")
        self.assertEqual(
            result["summary"],
            {"total": 1, "NOT_STARTED": 0, "IN_PROGRESS": 0, "SUPPORT_NEEDED": 1, "COMPLETE": 0},
        )
        self.assertEqual(self.listing(search="nimal test")["count"], 2)
        self.assertEqual(self.listing(search="risk analytics")["count"], 1)
        self.assertEqual(self.listing(employee=str(self.foreign.profile.id))["count"], 0)
        result = self.listing(status="COMPLETE", search="no match")
        self.assertEqual(result["summary"]["total"], 0)

    def test_due_buckets_and_completed_not_overdue(self):
        self.commitment(due=date(2026, 9, 30))
        self.commitment(status="COMPLETE", due=date(2026, 10, 1))
        self.commitment(due=date(2026, 10, 16))
        self.commitment(due=date(2026, 10, 31))
        self.commitment(due=date(2026, 11, 1))
        self.assertEqual(self.listing(due="overdue")["count"], 1)
        self.assertEqual(self.listing(due="month")["count"], 3)
        self.assertEqual(self.listing(due="later")["count"], 1)
        complete = self.listing(status="COMPLETE")["results"][0]
        self.assertFalse(complete["overdue"])

    def test_filter_options_permissions_and_company_isolation(self):
        Department.objects.create(company=self.other, name="Foreign department")
        url = "/api/v1/development/filters/"
        result = self.acting(self.hr).get(url)
        self.assertEqual(result.status_code, 200)
        self.assertNotIn(str(self.foreign.profile.id), str(result.data))
        self.assertNotIn("Foreign department", str(result.data))
        self.assertEqual(self.acting(self.nimal).get(url).status_code, 403)
        self.assertEqual(self.client.get("/api/v1/development/").status_code, 403)

    def test_pagination_and_query_count_are_bounded(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        self.commitment()
        client = self.acting(self.hr)
        with CaptureQueriesContext(connection) as small:
            client.get("/api/v1/development/")
        for i in range(51):
            self.commitment(action=f"Commitment {i}")
        with CaptureQueriesContext(connection) as large:
            result = client.get("/api/v1/development/").data
        self.assertEqual(len(small), len(large))
        self.assertEqual(result["summary"]["total"], 52)
        self.assertEqual(len(result["results"]), 50)
        self.assertIsNotNone(result["next"])
        second = client.get("/api/v1/development/?page=2").data
        self.assertEqual(len(second["results"]), 2)
        self.assertIsNotNone(second["previous"])

    def test_progress_evidence_and_work_assignment_preserved(self):
        item = self.commitment()
        client = self.acting(self.hr)
        base = f"/api/v1/development/{item.id}/"
        result = client.post(base + "create-work/", {}, format="json")
        self.assertEqual(result.status_code, 201)
        work = WorkItem.objects.get(pk=result.data["work_item"])
        self.assertEqual(work.assigned_to_id, item.employee_id)
        evidence = EvidenceItem.objects.create(
            company=self.company, task=work, uploaded_by=self.hr, title="Agreed evidence", kind="NOTE"
        )
        item.refresh_from_db()
        result = client.post(
            base + "progress/",
            {
                "version": item.version,
                "status": "SUPPORT_NEEDED",
                "notes": "Need practice time",
                "evidence_ids": [str(evidence.id)],
            },
            format="json",
        )
        self.assertEqual(result.status_code, 200, result.data)
        item.refresh_from_db()
        self.assertEqual(item.status, "SUPPORT_NEEDED")
        self.assertEqual(item.manager_support, "Original support text")
        history = client.get(base + "history/").data
        self.assertEqual(history[0]["notes"], "Need practice time")
        self.assertEqual(history[0]["evidence_ids"], [evidence.id])
        foreign_work = WorkItem.objects.create(
            company=self.other,
            assigned_by=self.foreign.profile,
            assigned_to=self.foreign.profile,
            accountable_owner=self.foreign.profile,
            title="Foreign work",
            expected_outcome="Foreign outcome",
            due_date=self.today,
        )
        foreign_evidence = EvidenceItem.objects.create(
            company=self.other,
            task=foreign_work,
            uploaded_by=self.foreign,
            title="Foreign evidence",
            kind="NOTE",
        )
        rejected = client.post(
            base + "progress/",
            {
                "version": item.version,
                "status": "COMPLETE",
                "notes": "Must reject",
                "evidence_ids": [str(foreign_evidence.id)],
            },
            format="json",
        )
        self.assertEqual(rejected.status_code, 400)
        item.refresh_from_db()
        self.assertEqual(item.status, "SUPPORT_NEEDED")
        foreign = self.commitment(self.foreign)
        self.assertEqual(client.get(f"/api/v1/development/{foreign.id}/history/").status_code, 404)
        self.assertEqual(
            self.acting(self.foreign).post(base + "progress/", {}, format="json").status_code, 404
        )

    def test_invalid_filters_and_nonfinal_reviews(self):
        item = self.commitment()
        item.review.state = "SUBMITTED"
        item.review.save()
        self.assertEqual(self.listing()["count"], 0)
        client = self.acting(self.hr)
        for params in [
            {"status": "FAKE"},
            {"due": "soon"},
            {"employee": "invalid"},
            {"department": "invalid"},
        ]:
            self.assertEqual(client.get("/api/v1/development/", params).status_code, 400)
