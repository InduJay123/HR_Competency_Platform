from unittest.mock import patch
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from apps.companies.models import Company, PlatformEvent
from apps.billing.models import BillingSettings, PaymentProof
from apps.billing.services import ensure_invoice
from tests import test_foundation, test_billing


class SuspensionTests(TestCase):
    person = test_foundation.FoundationTests.person
    acting = test_foundation.FoundationTests.acting
    file = test_billing.BillingTests.file

    def setUp(self):
        self.company = Company.objects.create(name="Suspended test", slug="suspended-test")
        self.other = Company.objects.create(name="Other test", slug="other-suspension-test")
        self.head = self.person("suspended-head", self.company, hr=True)
        self.staff = self.person("suspended-staff", self.company)
        self.other_head = self.person("other-head", self.other, hr=True)
        BillingSettings.objects.create(annual_fee="1000", currency="LKR", invoice_prefix="QA", issuer_name="QA issuer", active=True)
        self.invoice = ensure_invoice(self.company.pk)
        self.other_invoice = ensure_invoice(self.other.pk)
        self.company.active = False
        self.company.suspension_reason = Company.SuspensionReason.BILLING_OVERDUE
        self.company.save()
        self.client = self.acting(self.head)
        self.admin = APIClient()
        self.admin.force_login(get_user_model().objects.create_superuser(username="suspension-admin", email="suspension-admin@example.test", password="test"))

    def login(self, client=None, member=None, password="Long-secret-example-123!"):
        client = client or APIClient(enforce_csrf_checks=True)
        token = client.get("/api/v1/auth/session/").data["csrf_token"]
        return client.post("/api/v1/auth/login/", {"email": (member or self.head).user.email, "password": password, "role": "hr" if (member or self.head).is_hr else "employee"}, format="json", HTTP_X_CSRFTOKEN=token)

    def test_valid_credentials_allow_restricted_login(self):
        client = APIClient(enforce_csrf_checks=True)
        response = self.login(client)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["redirect"], "/hr/billing")
        state = client.get("/api/v1/auth/session/").data
        self.assertTrue(state["authenticated"])
        self.assertTrue(state["restricted_access"])
        self.assertTrue(state["billing_access"])
        self.assertEqual(state["suspension_reason"], "BILLING_OVERDUE")
        self.assertEqual(state["contexts"], [])
        self.assertIn("outstanding billing", state["suspension_message"])

    def test_invalid_credentials_and_public_session_do_not_disclose_suspension(self):
        response = self.login(password="incorrect")
        self.assertEqual(response.status_code, 400)
        self.assertNotIn("billing", str(response.data).lower())
        self.assertNotIn("suspend", str(response.data).lower())
        state = APIClient().get("/api/v1/auth/session/").data
        self.assertNotIn("suspension_reason", state)
        self.assertNotIn("memberships", state)

    def test_billing_current_history_and_pdf_allowed(self):
        self.assertEqual(self.client.get("/api/v1/billing/current/").data["id"], str(self.invoice.pk))
        self.assertEqual(len(self.client.get("/api/v1/billing/history/").data), 1)
        with patch("apps.billing.views.storage.put"):
            self.assertEqual(self.client.get(f"/api/v1/billing/invoices/{self.invoice.pk}/pdf/").status_code, 200)

    def test_upload_and_verification_status_allowed_without_reactivation(self):
        from apps.billing.services import today
        with patch("apps.billing.views.storage.put"):
            response = self.client.post("/api/v1/billing/current/payment-proof/", {"file": self.file(), "transaction_reference": "QA", "payment_date": str(today()), "company_id": str(self.other.pk)}, format="multipart")
        self.assertEqual(response.status_code, 201, response.data)
        proof = PaymentProof.objects.get(pk=response.data["id"])
        self.assertEqual(proof.invoice_id, self.invoice.pk)
        with patch("apps.billing.views.storage.get", return_value=b"private"):
            self.assertEqual(self.client.get(f"/api/v1/billing/payment-proofs/{proof.pk}/file/").status_code, 200)
            self.assertEqual(self.acting(self.other_head).get(f"/api/v1/billing/payment-proofs/{proof.pk}/file/").status_code, 404)
        self.company.refresh_from_db()
        self.assertFalse(self.company.active)
        self.assertEqual(self.admin.post(f"/api/v1/platform/billing/payment-proofs/{proof.pk}/approve/", {}, format="json").status_code, 200)
        self.company.refresh_from_db()
        self.assertFalse(self.company.active)
        self.assertEqual(self.client.get("/api/v1/billing/current/").data["status"], "PAID")

    def test_profile_read_update_and_logout_allowed(self):
        response = self.client.get("/api/v1/auth/profile/")
        self.assertEqual(response.status_code, 200)
        updated = self.client.patch("/api/v1/auth/profile/", {"version": response.data["version"], "first_name": "Updated"}, format="json")
        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertEqual(self.client.post("/api/v1/auth/logout/", {}, format="json").status_code, 200)
        self.assertFalse(self.client.get("/api/v1/auth/session/").data["authenticated"])

    def test_profile_photo_update_allowed(self):
        import io
        from PIL import Image
        from django.core.files.uploadedfile import SimpleUploadedFile
        stream = io.BytesIO()
        Image.new("RGB", (10, 10)).save(stream, "PNG")
        version = self.client.get("/api/v1/auth/profile/").data["version"]
        with patch("apps.accounts.photo.storage.put"):
            response = self.client.post("/api/v1/auth/profile/photo/", {"version": version, "photo": SimpleUploadedFile("avatar.png", stream.getvalue(), content_type="image/png")}, format="multipart")
        self.assertEqual(response.status_code, 200, response.data)

    def test_all_operational_apis_are_denied(self):
        for route in ["reports/overview/", "employees/", "reviews/", "review-history/", "review-cycles/", "pillar-targets/", "tasks/", "development/", "growth/", "notifications/", "organisation/departments/", "organisation/roles/", "access-requests/", "trainer/status/", "trainer/conversations/", "evidence/", "auth/requests/", f"companies/{self.company.pk}/", "platform/overview/", "platform/billing/invoices/"]:
            with self.subTest(route=route):
                response = self.client.get("/api/v1/" + route)
                self.assertEqual(response.status_code, 403)
                self.assertEqual(response.json()["error"]["code"], "COMPANY_SUSPENDED")
        self.assertEqual(self.client.post("/api/v1/tasks/", {}, format="json").status_code, 403)

    def test_foreign_invoice_denied_before_storage(self):
        with patch("apps.billing.views.storage.put") as put:
            self.assertEqual(self.client.get(f"/api/v1/billing/invoices/{self.other_invoice.pk}/pdf/").status_code, 404)
            put.assert_not_called()

    def test_admin_suspension_is_not_labelled_billing(self):
        self.company.suspension_reason = "ADMIN_SUSPENDED"
        self.company.save()
        response = self.login()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["redirect"], "/employee/account")
        state = self.client.get("/api/v1/auth/session/").data
        self.assertFalse(state["billing_access"])
        self.assertNotIn("billing", state["suspension_message"])
        self.assertEqual(self.client.get("/api/v1/billing/current/").status_code, 403)
        self.assertEqual(self.client.get("/api/v1/auth/profile/").status_code, 200)

    def test_steward_policy_unchanged(self):
        self.assertEqual(self.login(member=self.staff).status_code, 400)
        client = self.acting(self.staff)
        self.assertEqual(client.get("/api/v1/billing/current/").status_code, 403)
        self.assertEqual(client.get("/api/v1/employees/").status_code, 403)
        self.assertEqual(client.get("/api/v1/auth/profile/").status_code, 403)

    def test_superadmin_access_reactivation_and_audit(self):
        self.assertEqual(self.admin.get("/api/v1/platform/companies/").status_code, 200)
        self.assertEqual(self.admin.get("/api/v1/platform/billing/invoices/").status_code, 200)
        url = f"/api/v1/platform/companies/{self.company.pk}/access/"
        self.assertEqual(self.client.post(url, {"active": True, "note": "bypass"}, format="json").status_code, 403)
        self.assertEqual(self.admin.post(url, {"active": True, "note": "Verified"}, format="json").status_code, 200)
        state = self.client.get("/api/v1/auth/session/").data
        self.assertFalse(state["restricted_access"])
        self.assertIn("hr", state["contexts"])
        self.assertEqual(self.client.get("/api/v1/employees/").status_code, 200)
        self.assertTrue(PlatformEvent.objects.filter(action="company.access_changed", company=self.company).exists())

    def test_reason_is_recorded_only_by_superadmin(self):
        url = f"/api/v1/platform/companies/{self.other.pk}/access/"
        response = self.admin.post(url, {"active": False, "note": "Annual invoice overdue", "suspension_reason": "BILLING_OVERDUE"}, format="json")
        self.assertEqual(response.data["suspension_reason"], "BILLING_OVERDUE")
        event = PlatformEvent.objects.filter(company=self.other, action="company.access_changed").latest("created_at")
        self.assertEqual(event.details["suspension_reason"], "BILLING_OVERDUE")

    def test_membership_helper_default_still_denies_suspended_company(self):
        from common.permissions import membership
        from rest_framework.exceptions import PermissionDenied
        from types import SimpleNamespace
        request = SimpleNamespace(user=self.head.user, session={"company_id": str(self.company.pk)})
        with self.assertRaises(PermissionDenied):
            membership(request)
        self.assertEqual(membership(request, suspended_access="billing").pk, self.head.pk)

    def test_forged_company_selection_does_not_grant_access(self):
        session = self.client.session
        session["company_id"] = str(self.other.pk)
        session.save()
        self.assertEqual(self.client.get("/api/v1/billing/current/").status_code, 403)
        self.assertEqual(self.client.get("/api/v1/auth/profile/").status_code, 403)

    def test_actual_suspension_note_and_category_correction_without_reactivation(self):
        for category in ["ADMIN_SUSPENDED", "BILLING_OVERDUE"]:
            note = "Admin supplied explanation: " + category
            response = self.admin.post(f"/api/v1/platform/companies/{self.company.pk}/access/", {"active": False, "suspension_reason": category, "note": note}, format="json")
            self.assertEqual(response.status_code, 200)
            state = self.client.get("/api/v1/auth/session/").data
            self.assertEqual(state["suspension_note"], note)
            self.assertEqual(state["suspension_reason"], category)
            self.assertIsNotNone(state["suspended_at"])
            self.assertIsNotNone(state["suspended_by"])
            self.assertEqual(state["billing_access"], category == "BILLING_OVERDUE")
            self.assertEqual(self.client.get("/api/v1/billing/current/").status_code, 200 if category == "BILLING_OVERDUE" else 403)
            self.company.refresh_from_db()
            self.assertFalse(self.company.active)
            other = self.acting(self.other_head).get("/api/v1/auth/session/").data
            self.assertNotIn(note, str(other))
            self.assertNotIn(note, str(APIClient().get("/api/v1/auth/session/").data))

    def test_session_allowed_areas_match_billing_permission(self):
        state = self.client.get("/api/v1/auth/session/").data
        self.assertEqual(state["allowed_areas"], ["billing", "account"])
        self.assertEqual(state["suspension_label"], self.company.get_suspension_reason_display())
        self.company.suspension_reason = "ADMIN_SUSPENDED"
        self.company.save()
        state = self.client.get("/api/v1/auth/session/").data
        self.assertEqual(state["allowed_areas"], ["account"])
        self.assertFalse(state["billing_access"])

    def test_suspended_own_employee_photo_only(self):
        from io import BytesIO
        from PIL import Image
        stream = BytesIO()
        Image.new("RGB", (2, 2)).save(stream, format="PNG")
        profile = self.head.profile
        profile.avatar_data = stream.getvalue()
        profile.save()
        for category in ["BILLING_OVERDUE", "ADMIN_SUSPENDED"]:
            self.company.suspension_reason = category
            self.company.save()
            response = self.client.get(f"/api/v1/employees/{profile.pk}/photo/")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.content, stream.getvalue())
            self.assertEqual(response["Cache-Control"], "private, no-store")
            for other in [self.staff, self.other_head]:
                self.assertEqual(self.client.get(f"/api/v1/employees/{other.profile.pk}/photo/").status_code, 403)
            self.assertEqual(self.client.get(f"/api/v1/employees/{profile.pk}/").status_code, 403)
            self.assertEqual(self.client.post(f"/api/v1/employees/{profile.pk}/photo/", {}).status_code, 403)
            self.assertEqual(self.client.get("/api/v1/auth/profile/").status_code, 200)
