from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.companies.models import Company, Membership
from apps.organisation.models import Department, EmployeeProfile
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
        self.client = APIClient()

    def person(self, name, company, manager=False, hr=False):
        # A managerial job title no longer grants any reporting responsibility.
        u = get_user_model().objects.create_user(
            username=f"{name}@example.test",
            email=f"{name}@example.test",
            password="Long-secret-example-123!",
            first_name=name.title(),
            last_name="Test",
        )
        m = Membership.objects.create(company=company, user=u, is_hr=hr, is_head_hr=hr)
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
        return assign_work(self.hr, data)

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

    def test_head_hr_team_is_all_other_employees(self):
        data = self.acting(self.hr).get("/api/v1/employees/?scope=team").data["results"]
        self.assertEqual({x["email"] for x in data}, {self.sarah.user.email, self.nimal.user.email, self.kamal.user.email})

    def test_normal_employee_has_no_team(self):
        self.assertEqual(self.acting(self.sarah).get("/api/v1/employees/?scope=team").data["count"], 0)

    def test_arbitrary_reporting_assignment_rejected(self):
        for key in ("manager_id", "reports_to", "reporting_manager", "is_manager"):
            response = self.acting(self.hr).patch(f"/api/v1/employees/{self.nimal.profile.id}/",
                {"version": 1, key: str(self.sarah.profile.id)}, format="json")
            self.assertEqual(response.status_code, 400)
        response = self.acting(self.hr).post(f"/api/v1/employees/{self.nimal.profile.id}/reporting/",
            {"version": 1, "manager_id": str(self.sarah.profile.id)}, format="json")
        self.assertEqual(response.status_code, 404)

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
        r = self.acting(self.hr).post("/api/v1/tasks/", self.task_data(), format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data["accountable_owner"], self.nimal.profile.id)

    def test_normal_employee_cannot_assign_work_to_peer(self):
        r = self.acting(self.sarah).post("/api/v1/tasks/", self.task_data(self.kamal), format="json")
        self.assertEqual(r.status_code, 403)

    def test_assignment_foreign_denied(self):
        r = self.acting(self.hr).post("/api/v1/tasks/", self.task_data(self.foreign), format="json")
        self.assertEqual(r.status_code, 400)

    def test_normal_employee_cannot_delegate_and_parent_is_preserved(self):
        parent = self.task()
        r = self.acting(self.nimal).post(
            f"/api/v1/tasks/{parent.id}/delegate/", self.task_data(self.kamal), format="json"
        )
        self.assertEqual(r.status_code, 403)
        parent.refresh_from_db()
        self.assertEqual(parent.accountable_owner, self.nimal.profile)
        self.assertFalse(WorkItem.objects.filter(parent_task=parent).exists())

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
        r = self.acting(self.hr).post(
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
