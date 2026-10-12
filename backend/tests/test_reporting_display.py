from unittest.mock import patch

from django.test import TestCase
from rest_framework.pagination import PageNumberPagination

from apps.companies.models import Company
from apps.organisation.models import ReportingRelationship
from apps.organisation.serializers import EmployeeSerializer, SelfProfileSerializer
from apps.organisation.services import set_manager
from tests.test_foundation import FoundationTests


class ReportingDisplayTests(TestCase):
    person = FoundationTests.person
    acting = FoundationTests.acting

    def setUp(self):
        self.company = Company.objects.create(name="Reporting", slug="reporting")
        self.hr = self.person("hr", self.company, hr=True)
        self.abc = self.person("abc", self.company, manager=True)
        self.dinaya = self.person("dinaya", self.company, manager=True)
        self.xyz = self.person("xyz", self.company)
        for member, first, last in [(self.abc, "abc", "abc"), (self.dinaya, "Dinaya", "Nuu"), (self.xyz, "xyz", "xyz")]:
            member.user.first_name = first
            member.user.last_name = last
            member.user.save(update_fields=["first_name", "last_name"])
        set_manager(self.hr, self.dinaya.profile.id, self.abc.profile.id, 1)
        set_manager(self.hr, self.xyz.profile.id, self.dinaya.profile.id, 1)

    def test_manager_identity_resolves_without_exposing_manager_profile_or_changing_hierarchy(self):
        before = list(ReportingRelationship.objects.order_by("id").values())
        client = self.acting(self.dinaya)
        response = client.get("/api/v1/employees/")
        self.assertEqual(response.status_code, 200)
        rows = {row["id"]: row for row in response.data["results"]}
        self.assertEqual(set(rows), {str(self.dinaya.profile.id), str(self.xyz.profile.id)})
        dinaya = rows[str(self.dinaya.profile.id)]
        self.assertEqual(dinaya["manager_id"], str(self.abc.profile.id))
        self.assertEqual(dinaya["manager_name"], "abc abc")
        self.assertEqual(rows[str(self.xyz.profile.id)]["manager_name"], "Dinaya Nuu")
        self.assertNotIn("manager_email", dinaya)
        self.assertNotIn("manager", dinaya)
        self.assertEqual(client.get(f"/api/v1/employees/{self.abc.profile.id}/").status_code, 404)
        self.assertEqual(list(ReportingRelationship.objects.order_by("id").values()), before)
        self.assertEqual(SelfProfileSerializer(self.dinaya.profile).data["manager_name"], "abc abc")

    def test_pagination_and_search_do_not_control_name_resolution(self):
        client = self.acting(self.dinaya)
        with patch.object(PageNumberPagination, "page_size", 1):
            page = client.get("/api/v1/employees/?page=2")
        self.assertEqual(len(page.data["results"]), 1)
        self.assertEqual(page.data["results"][0]["manager_name"], "Dinaya Nuu")
        result = client.get("/api/v1/employees/?search=xyz")
        self.assertEqual(result.data["count"], 1)
        self.assertEqual(result.data["results"][0]["manager_name"], "Dinaya Nuu")

    def test_no_manager_and_inactive_assigned_manager(self):
        self.assertEqual(EmployeeSerializer(self.abc.profile).data["manager_name"], "")
        self.assertIsNone(EmployeeSerializer(self.abc.profile).data["manager_id"])
        self.abc.active = False
        self.abc.save(update_fields=["active"])
        response = self.acting(self.dinaya).get("/api/v1/employees/?search=Dinaya")
        self.assertEqual(response.data["results"][0]["manager_name"], "abc abc")

    def test_invalid_cross_company_relationship_does_not_expose_name(self):
        other = Company.objects.create(name="Other", slug="other")
        foreign = self.person("foreign", other, manager=True)
        # Defensive coverage for inconsistent data; assignments normally reject this.
        ReportingRelationship.objects.filter(employee=self.dinaya.profile).update(manager=foreign.profile)
        result = self.acting(self.dinaya).get("/api/v1/employees/?search=Dinaya")
        self.assertEqual(result.data["results"][0]["manager_name"], "")
        self.assertEqual(self.acting(self.dinaya).get(f"/api/v1/employees/{foreign.profile.id}/").status_code, 404)
