from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.companies.models import Company, Membership
from apps.organisation.models import Department, EmployeeProfile, ReportingRelationship
from apps.organisation.services import set_manager
from apps.tasks.models import WorkItem
from apps.tasks.services import assign_work


class FoundationTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Atlas Holdings", slug="atlas")
        self.other = Company.objects.create(name="Other Company", slug="other")
        self.hr = self.person("head", self.company, hr=True)
        self.sarah = self.person("sarah", self.company, manager=True)
        self.nimal = self.person("nimal", self.company, manager=True)
        self.kamal = self.person("kamal", self.company)
        self.foreign = self.person("foreign", self.other, manager=True)
        set_manager(self.hr, self.nimal.profile.id, self.sarah.profile.id, 1)
        set_manager(self.hr, self.kamal.profile.id, self.nimal.profile.id, 1)
        self.client = APIClient()

    def person(self, name, company, manager=False, hr=False):
        u = get_user_model().objects.create_user(
            username=f"{name}@example.test",
            email=f"{name}@example.test",
            password="Long-secret-example-123!",
            first_name=name.title(),
            last_name="Test",
        )
        m = Membership.objects.create(company=company, user=u, is_manager=manager, is_hr=hr, is_head_hr=hr)
        EmployeeProfile.objects.create(
            company=company, membership=m, designation="Manager" if manager else "Employee"
        )
        return m

    def acting(self, member, csrf=False):
        client = APIClient(enforce_csrf_checks=csrf)
        client.force_login(member.user)
        session = client.session
        session["company_id"] = str(member.company_id)
        session.save()
        return client

    def task_data(self, assignee=None):
        return {
            "title": "Improve handover",
            "expected_outcome": "Reduce missed handovers",
            "assigned_to": str((assignee or self.nimal).profile.id),
            "due_date": "2026-12-20",
        }

    def task(self):
        data = self.task_data()
        data["due_date"] = date(2026, 12, 20)
        return assign_work(self.sarah, data)

    def test_anonymous_cannot_read(self):
        self.assertEqual(self.client.get("/api/v1/employees/").status_code, 403)

    def test_login_requires_csrf_even_anonymous(self):
        c = APIClient(enforce_csrf_checks=True)
        self.assertEqual(
            c.post(
                "/api/v1/auth/login/",
                {"email": self.sarah.user.email, "password": "Long-secret-example-123!"},
                format="json",
            ).status_code,
            403,
        )
        token = c.get("/api/v1/auth/session/").data["csrf_token"]
        self.assertEqual(
            c.post(
                "/api/v1/auth/login/",
                {"email": self.sarah.user.email, "password": "Long-secret-example-123!"},
                format="json",
                HTTP_X_CSRFTOKEN=token,
            ).status_code,
            200,
        )

    def test_context_cannot_grant_role(self):
        c = self.acting(self.kamal)
        self.assertEqual(
            c.post(
                "/api/v1/auth/context/", {"company_id": str(self.company.id), "context": "hr"}, format="json"
            ).status_code,
            403,
        )

    def test_context_cannot_select_other_tenant(self):
        c = self.acting(self.hr)
        self.assertEqual(
            c.post(
                "/api/v1/auth/context/", {"company_id": str(self.other.id), "context": "hr"}, format="json"
            ).status_code,
            403,
        )

    def test_cross_tenant_person_hidden(self):
        self.assertEqual(
            self.acting(self.hr).get(f"/api/v1/employees/{self.foreign.profile.id}/").status_code, 404
        )

    def test_unrelated_employee_hidden(self):
        self.assertEqual(
            self.acting(self.kamal).get(f"/api/v1/employees/{self.sarah.profile.id}/").status_code, 404
        )

    def test_manager_gets_direct_reports_not_grandchildren(self):
        data = self.acting(self.sarah).get("/api/v1/employees/").data["results"]
        self.assertEqual({x["email"] for x in data}, {self.sarah.user.email, self.nimal.user.email})

    def test_hierarchy_self_rejected(self):
        r = self.acting(self.hr).post(
            f"/api/v1/employees/{self.sarah.profile.id}/reporting/",
            {"manager_id": str(self.sarah.profile.id), "version": 1},
            format="json",
        )
        self.assertEqual(r.status_code, 400)

    def test_hierarchy_cycle_rejected(self):
        self.kamal.is_manager = True
        self.kamal.save()
        r = self.acting(self.hr).post(
            f"/api/v1/employees/{self.sarah.profile.id}/reporting/",
            {"manager_id": str(self.kamal.profile.id), "version": 1},
            format="json",
        )
        self.assertEqual(r.status_code, 400)
        self.assertFalse(ReportingRelationship.objects.filter(employee=self.sarah.profile).exists())

    def test_cross_tenant_manager_rejected(self):
        r = self.acting(self.hr).post(
            f"/api/v1/employees/{self.sarah.profile.id}/reporting/",
            {"manager_id": str(self.foreign.profile.id), "version": 1},
            format="json",
        )
        self.assertEqual(r.status_code, 400)

    def test_stale_hierarchy_update_conflicts(self):
        r = self.acting(self.hr).post(
            f"/api/v1/employees/{self.nimal.profile.id}/reporting/",
            {"manager_id": None, "version": 1},
            format="json",
        )
        self.assertEqual(r.status_code, 409)

    def test_non_hr_cannot_create_people(self):
        r = self.acting(self.sarah).post(
            "/api/v1/employees/",
            {"email": "new@example.test", "first_name": "New", "last_name": "Person"},
            format="json",
        )
        self.assertEqual(r.status_code, 403)

    def test_new_person_cannot_elevate_their_roles(self):
        r = self.acting(self.hr).post(
            "/api/v1/employees/",
            {
                "email": "new@example.test",
                "first_name": "New",
                "last_name": "Person",
                "is_hr": True,
                "is_head_hr": True,
            },
            format="json",
        )
        self.assertEqual(r.status_code, 201)
        member = Membership.objects.get(user__email="new@example.test")
        self.assertFalse(member.is_hr)
        self.assertFalse(member.user.has_usable_password())

    def test_department_is_tenant_scoped(self):
        d = Department.objects.create(company=self.other, name="Other")
        self.assertEqual(
            self.acting(self.hr).get(f"/api/v1/organisation/departments/{d.id}/").status_code, 404
        )

    def test_assignment_to_direct_report(self):
        r = self.acting(self.sarah).post("/api/v1/tasks/", self.task_data(), format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data["accountable_owner"], self.nimal.profile.id)

    def test_assignment_to_grandchild_denied(self):
        r = self.acting(self.sarah).post("/api/v1/tasks/", self.task_data(self.kamal), format="json")
        self.assertEqual(r.status_code, 403)

    def test_assignment_foreign_denied(self):
        r = self.acting(self.sarah).post("/api/v1/tasks/", self.task_data(self.foreign), format="json")
        self.assertEqual(r.status_code, 400)

    def test_delegation_preserves_parent(self):
        parent = self.task()
        r = self.acting(self.nimal).post(
            f"/api/v1/tasks/{parent.id}/delegate/", self.task_data(self.kamal), format="json"
        )
        self.assertEqual(r.status_code, 201)
        parent.refresh_from_db()
        child = WorkItem.objects.get(id=r.data["id"])
        self.assertEqual(parent.accountable_owner, self.nimal.profile)
        self.assertEqual(parent.assigned_to, self.nimal.profile)
        self.assertEqual(child.accountable_owner, self.kamal.profile)
        self.assertEqual(child.parent_task, parent)

    def test_assignee_updates_blocker_and_result(self):
        t = self.task()
        c = self.acting(self.nimal)
        url = f"/api/v1/tasks/{t.id}/updates/"
        self.assertEqual(c.post(url, {"version": 1, "status": "BLOCKED"}, format="json").status_code, 400)
        self.assertEqual(
            c.post(
                url, {"version": 1, "status": "BLOCKED", "blocker": "Need sign-off"}, format="json"
            ).status_code,
            200,
        )
        self.assertEqual(
            c.post(url, {"version": 1, "status": "DONE", "result": "Resolved"}, format="json").status_code,
            409,
        )
        self.assertEqual(
            c.post(url, {"version": 2, "status": "DONE", "result": "Resolved"}, format="json").status_code,
            200,
        )
        self.assertEqual(c.post(url, {"version": 3, "status": "IN_PROGRESS"}, format="json").status_code, 400)
        self.assertEqual(t.updates.count(), 2)

    def test_manager_cannot_impersonate_employee_progress(self):
        t = self.task()
        r = self.acting(self.sarah).post(
            f"/api/v1/tasks/{t.id}/updates/", {"version": 1, "status": "IN_PROGRESS"}, format="json"
        )
        self.assertEqual(r.status_code, 403)

    def test_cross_tenant_task_is_hidden(self):
        t = self.task()
        self.assertEqual(self.acting(self.foreign).get(f"/api/v1/tasks/{t.id}/").status_code, 404)

    def test_assignment_notification_private(self):
        self.task()
        self.assertEqual(self.acting(self.nimal).get("/api/v1/notifications/").data["count"], 1)
        self.assertEqual(self.acting(self.kamal).get("/api/v1/notifications/").data["count"], 0)

    def test_audit_has_no_task_narrative(self):
        self.task()
        entry = AuditLog.objects.get(action="work.assigned")
        self.assertNotIn("description", entry.metadata)
