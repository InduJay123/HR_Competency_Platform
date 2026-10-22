from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.services import send_access_email
from apps.companies.models import Company
from tests import test_foundation


@override_settings(
    ALLOWED_HOSTS=["testserver", "btflplatform.com", "admin.btflplatform.com"],
    FRONTEND_URL="https://btflplatform.com",
    ADMIN_FRONTEND_URL="https://admin.btflplatform.com",
    CSRF_TRUSTED_ORIGINS=["https://btflplatform.com", "https://admin.btflplatform.com"],
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class PortalTests(TestCase):
    person = test_foundation.FoundationTests.person

    def setUp(self):
        cache.clear()
        self.company = Company.objects.create(name="Portal", slug="portal")
        self.hr = self.person("chief", self.company, hr=True).user
        self.employee = self.person("steward", self.company).user
        self.admin = get_user_model().objects.create_superuser(
            username="admin", email="admin@example.test", password="Long-secret-example-123!"
        )

    def client_for(self, admin=False):
        host = "admin.btflplatform.com" if admin else "btflplatform.com"
        return APIClient(enforce_csrf_checks=True, HTTP_HOST=host, HTTP_ORIGIN=f"https://{host}")

    def login(self, client, user, role="auto"):
        token = client.get("/api/v1/auth/session/", secure=True).json()["csrf_token"]
        return client.post("/api/v1/auth/login/", {
            "email": user.email, "password": "Long-secret-example-123!", "role": role,
        }, format="json", secure=True, HTTP_X_CSRFTOKEN=token)

    def test_normal_roles_and_logout(self):
        for user, role in [(self.hr, "hr"), (self.employee, "employee")]:
            client = self.client_for()
            result = self.login(client, user, role)
            self.assertEqual(result.status_code, 200)
            self.assertEqual(result.data["redirect"], f"/{role}/dashboard")
            self.assertFalse(result.cookies["sessionid"]["domain"])
            self.assertTrue(result.cookies["sessionid"]["httponly"])
            self.assertEqual(result.cookies["sessionid"]["samesite"], "Lax")
            self.assertEqual(client.post("/api/v1/auth/logout/", secure=True,
                HTTP_X_CSRFTOKEN=result.data["csrf_token"]).status_code, 200)

    def test_credentials_do_not_grant_wrong_portal(self):
        for user in [self.hr, self.employee]:
            client = self.client_for(True)
            result = self.login(client, user)
            self.assertEqual(result.status_code, 403)
            self.assertIn("This account does not have Platform Administration access.", str(result.data))
            self.assertFalse(client.get("/api/v1/auth/session/", secure=True).json()["authenticated"])
        result = self.login(self.client_for(), self.admin)
        self.assertEqual(result.status_code, 403)
        self.assertIn("administrator portal", str(result.data))

    def test_admin_session_and_api_are_host_bound(self):
        client = self.client_for(True)
        result = self.login(client, self.admin)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data["redirect"], "/platform")
        self.assertEqual(client.get("/api/v1/platform/overview/", secure=True).status_code, 200)
        self.assertEqual(client.get("/api/v1/platform/overview/", secure=True,
            HTTP_HOST="btflplatform.com").status_code, 403)
        self.assertEqual(client.post("/api/v1/auth/logout/", secure=True,
            HTTP_X_CSRFTOKEN=result.data["csrf_token"]).status_code, 200)
        self.assertEqual(client.get("/api/v1/platform/overview/", secure=True).status_code, 403)

    def test_csrf_required_on_both_hosts(self):
        for admin in [False, True]:
            client = self.client_for(admin)
            result = client.post("/api/v1/auth/login/", {
                "email": self.admin.email, "password": "Long-secret-example-123!"
            }, format="json", secure=True)
            self.assertEqual(result.status_code, 403)

    def test_forged_forwarded_host_does_not_choose_production_portal(self):
        client = self.client_for()
        client.defaults["HTTP_X_FORWARDED_HOST"] = "admin.btflplatform.com"
        self.assertEqual(self.login(client, self.admin).status_code, 403)

    def test_wrong_credentials_do_not_reveal_admin_authorization(self):
        client = self.client_for(True)
        token = client.get("/api/v1/auth/session/", secure=True).json()["csrf_token"]
        for user in [self.admin, self.employee]:
            result = client.post("/api/v1/auth/login/", {
                "email": user.email, "password": "incorrect",
            }, format="json", secure=True, HTTP_X_CSRFTOKEN=token)
            self.assertEqual(result.status_code, 400)
            self.assertIn("Unable to sign in with these credentials.", str(result.data))

    def test_normal_session_cannot_be_replayed_on_admin_host(self):
        client = self.client_for()
        self.assertEqual(self.login(client, self.employee).status_code, 200)
        self.assertEqual(client.get("/api/v1/platform/overview/", secure=True,
            HTTP_HOST="admin.btflplatform.com").status_code, 403)

    def test_password_reset_uses_account_portal_and_existing_tokens(self):
        from urllib.parse import urlsplit, parse_qs
        for user, admin in [(self.admin, True), (self.employee, False)]:
            send_access_email(user)
            link = mail.outbox[-1].body.splitlines()[1]
            self.assertEqual(urlsplit(link).hostname,
                "admin.btflplatform.com" if admin else "btflplatform.com")
            query = parse_qs(urlsplit(link).query)
            client = self.client_for(admin)
            token = client.get("/api/v1/auth/session/", secure=True).json()["csrf_token"]
            result = client.post("/api/v1/auth/set-password/", {
                "uid": query["uid"][0], "token": query["token"][0],
                "password": "Replacement-secret-example-123!",
            }, format="json", secure=True, HTTP_X_CSRFTOKEN=token)
            self.assertEqual(result.status_code, 200)
