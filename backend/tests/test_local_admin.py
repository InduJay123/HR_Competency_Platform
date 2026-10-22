from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient


@override_settings(ALLOWED_HOSTS=["localhost", "127.0.0.1", "btflplatform.com", "admin.btflplatform.com"],
                   LOCAL_ADMIN_LOGIN_ENABLED=True,
                   ADMIN_FRONTEND_URL="https://admin.btflplatform.com")
class LocalAdminTests(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = get_user_model().objects.create_superuser(
            username="admin", email="admin@example.test", password="Test-secret-password!"
        )
        self.user = get_user_model().objects.create_user(
            username="user", email="user@example.test", password="Test-secret-password!"
        )
        self.client = APIClient(enforce_csrf_checks=True, HTTP_HOST="localhost:3000")

    def sign_in(self, user, endpoint="admin-login", **extra):
        token = self.client.get("/api/v1/auth/session/").json()["csrf_token"]
        return self.client.post(f"/api/v1/auth/{endpoint}/", {
            "email": user.email, "password": "Test-secret-password!",
        }, format="json", HTTP_X_CSRFTOKEN=token, **extra)

    def test_local_admin_requires_credentials_and_superuser(self):
        self.assertEqual(self.client.get("/api/v1/platform/overview/").status_code, 403)
        self.assertEqual(self.sign_in(self.user).status_code, 403)
        response = self.sign_in(self.admin)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["redirect"], "/platform")
        self.assertEqual(self.client.session["portal_mode"], "admin")
        self.assertEqual(self.client.get("/api/v1/platform/overview/").status_code, 200)
        self.admin.is_superuser = False
        self.admin.save(update_fields=["is_superuser"])
        self.assertEqual(self.client.get("/api/v1/platform/overview/").status_code, 403)

    def test_normal_login_still_rejects_admin(self):
        self.assertEqual(self.sign_in(self.admin, "login").status_code, 403)

    def test_admin_login_requires_csrf(self):
        self.assertEqual(self.client.post("/api/v1/auth/admin-login/", {
            "email": self.admin.email, "password": "Test-secret-password!",
        }).status_code, 403)

    @override_settings(LOCAL_ADMIN_LOGIN_ENABLED=False)
    def test_production_disables_local_exception(self):
        self.assertEqual(self.sign_in(self.admin).status_code, 403)

    def test_production_main_host_cannot_use_admin_endpoint(self):
        self.assertEqual(self.sign_in(self.admin, HTTP_HOST="btflplatform.com").status_code, 403)

    def test_admin_host_can_reuse_endpoint(self):
        self.assertEqual(self.sign_in(self.admin, HTTP_HOST="admin.btflplatform.com").status_code, 200)

    def test_logout_clears_local_admin_access(self):
        response = self.sign_in(self.admin)
        self.assertEqual(self.client.post("/api/v1/auth/logout/", HTTP_X_CSRFTOKEN=response.data["csrf_token"]).status_code, 200)
        self.assertEqual(self.client.get("/api/v1/platform/overview/").status_code, 403)

    def test_loopback_ip_admin_login(self):
        self.client.defaults["HTTP_HOST"] = "127.0.0.1:3000"
        self.assertEqual(self.sign_in(self.admin).status_code, 200)
