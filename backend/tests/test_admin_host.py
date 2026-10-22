from django.test import RequestFactory, TestCase, override_settings

from common.portal import is_admin_host, portal_host
from tests.test_portal import PortalTests


@override_settings(ALLOWED_HOSTS=["btflplatform.com", "admin.btflplatform.com"],
                   CSRF_TRUSTED_ORIGINS=["https://btflplatform.com", "https://admin.btflplatform.com"],
                   LOCAL_ADMIN_LOGIN_ENABLED=False, USE_X_FORWARDED_HOST=False,
                   ADMIN_FRONTEND_URL="http://admin.localhost:3000")
class AdminEndpointTests(TestCase):
    person = PortalTests.person
    setUp = PortalTests.setUp
    client_for = PortalTests.client_for
    test_credentials_do_not_grant_wrong_portal = PortalTests.test_credentials_do_not_grant_wrong_portal
    test_admin_session_and_api_are_host_bound = PortalTests.test_admin_session_and_api_are_host_bound
    test_forged_forwarded_host_does_not_choose_production_portal = PortalTests.test_forged_forwarded_host_does_not_choose_production_portal

    # Exercise the explicit endpoint with the stale URL setting that caused rejection.
    def login(self, client, user, role="auto"):
        token = client.get("/api/v1/auth/session/", secure=True).json()["csrf_token"]
        return client.post("/api/v1/auth/admin-login/", {
            "email": user.email, "password": "Long-secret-example-123!", "role": role,
        }, format="json", secure=True, HTTP_X_CSRFTOKEN=token)

    def test_normal_roles_and_logout(self):
        # Normal roles must continue to use the normal endpoint.
        for user, role in [(self.hr, "hr"), (self.employee, "employee")]:
            result = PortalTests.login(self, self.client_for(), user, role)
            self.assertEqual(result.status_code, 200)
            self.assertEqual(result.data["redirect"], f"/{role}/dashboard")

    def test_csrf_required_on_both_hosts(self):
        for admin in [False, True]:
            result = self.client_for(admin).post("/api/v1/auth/admin-login/", {
                "email": self.admin.email, "password": "Long-secret-example-123!",
            }, format="json", secure=True)
            self.assertEqual(result.status_code, 403)
            self.assertIn("CSRF", result.content.decode())

    def test_preserved_caddy_host_is_used_not_forwarded_host(self):
        request = RequestFactory().get("/api/v1/auth/admin-login/",
            HTTP_HOST="admin.btflplatform.com", HTTP_X_FORWARDED_HOST="backend",
            HTTP_X_FORWARDED_PROTO="https")
        self.assertEqual(request.get_host(), "admin.btflplatform.com")
        self.assertEqual(portal_host(request), "admin.btflplatform.com")
        self.assertTrue(is_admin_host(request))

    @override_settings(ALLOWED_HOSTS=["backend", "localhost", "btflplatform.com", "admin.btflplatform.com"])
    def test_internal_host_and_forged_context_cannot_select_admin(self):
        for host in ["backend", "localhost", "btflplatform.com"]:
            with self.subTest(host=host):
                client = self.client_for()
                client.defaults.update(HTTP_HOST=host, HTTP_X_FORWARDED_HOST="admin.btflplatform.com",
                    HTTP_ORIGIN="https://admin.btflplatform.com",
                    HTTP_REFERER="https://admin.btflplatform.com/admin/login")
                self.assertEqual(self.login(client, self.admin).status_code, 403)

    def test_untrusted_origin_rejected_even_with_valid_csrf_token(self):
        client = self.client_for(True)
        client.defaults["HTTP_ORIGIN"] = "https://attacker.invalid"
        self.assertEqual(self.login(client, self.admin).status_code, 403)

    def test_normal_endpoint_still_rejects_superuser(self):
        self.assertEqual(PortalTests.login(self, self.client_for(), self.admin).status_code, 403)

    @override_settings(ADMIN_FRONTEND_URL="https://btflplatform.com")
    def test_misconfigured_url_cannot_authorize_normal_host(self):
        self.assertEqual(self.login(self.client_for(), self.admin).status_code, 403)

    def test_normal_session_cannot_be_replayed_on_admin_host(self):
        client = self.client_for()
        self.assertEqual(PortalTests.login(self, client, self.employee).status_code, 200)
        self.assertEqual(client.get("/api/v1/platform/overview/", secure=True,
            HTTP_HOST="admin.btflplatform.com").status_code, 403)

    def test_unlisted_host_is_rejected_before_portal_selection(self):
        request = RequestFactory().get("/", HTTP_HOST="attacker.invalid",
            HTTP_X_FORWARDED_HOST="admin.btflplatform.com")
        from django.core.exceptions import DisallowedHost
        with self.assertRaises(DisallowedHost):
            is_admin_host(request)
