import io
from unittest.mock import Mock, patch

import requests
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from apps.companies.models import Company, Membership
from apps.evidence import storage
from apps.organisation.models import EmployeeProfile
from tests import test_foundation


@override_settings(SUPABASE_URL="https://storage.example.test", SUPABASE_SERVICE_KEY="server-secret")
class CompanyLogoStorageTests(TestCase):
    person = test_foundation.FoundationTests.person
    acting = test_foundation.FoundationTests.acting

    def setUp(self):
        self.company = Company.objects.create(name="Atlas", slug="atlas", tagline="Unchanged")
        self.other = Company.objects.create(name="Other", slug="other")
        self.hr = self.person("hr", self.company, hr=True)
        self.employee = self.person("employee", self.company)
        self.other_hr = self.person("other-hr", self.other, hr=True)
        self.url = f"/api/v1/company-logo/{self.company.id}/"
        self.public = APIClient()

    def photo(self):
        output = io.BytesIO()
        Image.new("RGBA", (40, 20), (30, 60, 200, 0)).save(output, format="PNG")
        return SimpleUploadedFile("logo.png", output.getvalue(), content_type="image/png")

    def test_cleanup_only_removes_exact_local_generated_urls_with_stored_logo(self):
        from importlib import import_module
        from types import SimpleNamespace
        from django.apps import apps
        from django.db import connection

        clean = import_module("apps.companies.migrations.0006_clear_legacy_local_logo_urls").clear_legacy_urls
        self.company.logo_storage_path = f"{self.company.id}/logo-{'a' * 32}.png"
        self.company.logo_data = b"legacy"
        for url, expected in [
            (f"http://localhost:3000{self.url}", ""),
            (f"https://custom.example.test{self.url}", f"https://custom.example.test{self.url}"),
            (f"http://localhost:3000{self.url}?custom=1", f"http://localhost:3000{self.url}?custom=1"),
            ("https://custom.example.test/logo.png", "https://custom.example.test/logo.png"),
            (f"http://localhost:3000/api/v1/company-logo/{self.other.id}/", f"http://localhost:3000/api/v1/company-logo/{self.other.id}/"),
        ]:
            self.company.logo_url = url
            self.company.save()
            clean(apps, SimpleNamespace(connection=connection))
            self.company.refresh_from_db()
            self.assertEqual(self.company.logo_url, expected)
            self.assertEqual(bytes(self.company.logo_data), b"legacy")
            self.assertEqual(self.company.logo_storage_path, f"{self.company.id}/logo-{'a' * 32}.png")

    def test_all_logo_responses_are_relative_and_preserve_stored_values(self):
        self.company.logo_url = f"http://localhost:3000{self.url}"
        self.company.logo_storage_path = f"{self.company.id}/logo-{'a' * 32}.png"
        self.company.save()
        before = Company.objects.values().get(pk=self.company.id)
        client = self.acting(self.hr)
        profile = client.get(f"/api/v1/companies/{self.company.id}/")
        session = client.get("/api/v1/auth/session/")
        branding = self.public.get(f"/api/v1/auth/branding/{self.company.slug}/")
        self.assertEqual(profile.data["logo_url"], self.url)
        self.assertEqual(session.data["memberships"][0]["logo_url"], self.url)
        self.assertEqual(branding.data["logo_url"], self.url)
        self.assertEqual(Company.objects.values().get(pk=self.company.id), before)
        result = client.patch(f"/api/v1/companies/{self.company.id}/", {"logo_url": self.url}, format="json")
        self.assertEqual(result.status_code, 200)
        self.company.refresh_from_db()
        self.assertEqual(self.company.logo_url, before["logo_url"])
        self.assertEqual(self.company.logo_storage_path, before["logo_storage_path"])

    def test_uploaded_logo_takes_precedence_over_manual_url_without_deleting_it(self):
        self.company.logo_url = "https://example.test/manual.png"
        self.assertEqual(self.company.display_logo_url, self.company.logo_url)
        self.company.logo_data = b"legacy"
        self.assertEqual(self.company.display_logo_url, self.url)
        self.company.logo_data = None
        self.company.logo_storage_path = f"{self.company.id}/logo-{'a' * 32}.png"
        self.assertEqual(self.company.display_logo_url, self.url)
        self.assertEqual(self.company.logo_url, "https://example.test/manual.png")
        self.company.logo_storage_path = ""
        self.company.logo_url = ""
        self.assertEqual(self.company.display_logo_url, "")

    @override_settings(PRIVATE_STORAGE_BACKEND="local", DEBUG=True)
    def test_upload_uses_supabase_and_serves_same_route_without_changing_relationships(self):
        memberships = list(Membership.objects.order_by("id").values())
        employees = list(EmployeeProfile.objects.order_by("id").values())
        with patch.object(storage.requests, "post", return_value=Mock(status_code=200)) as upload:
            response = self.acting(self.hr).post(self.url, {"logo": self.photo()}, format="multipart")
        self.assertEqual(response.status_code, 200)
        self.company.refresh_from_db()
        key = self.company.logo_storage_path
        self.assertRegex(key, rf"^{self.company.id}/logo-[0-9a-f]{{32}}\.png$")
        self.assertIsNone(self.company.logo_data)
        self.assertEqual(response.data["logo_url"], self.url)
        self.assertEqual(upload.call_args.args[0], f"https://storage.example.test/storage/v1/object/company-logos/{key}")
        self.assertEqual(upload.call_args.kwargs["headers"]["x-upsert"], "false")
        content = upload.call_args.kwargs["data"]
        with patch.object(storage.requests, "get", return_value=Mock(status_code=200, content=content)) as download:
            result = self.public.get(self.url)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.content, content)
        self.assertEqual(result["Content-Type"], "image/png")
        self.assertIn(f"/company-logos/{key}", download.call_args.args[0])
        self.assertNotIn("server-secret", str(response.data) + str(result.headers))
        self.assertEqual(self.company.name, "Atlas")
        self.assertEqual(self.company.tagline, "Unchanged")
        self.assertEqual(list(Membership.objects.order_by("id").values()), memberships)
        self.assertEqual(list(EmployeeProfile.objects.order_by("id").values()), employees)

    def test_replacement_uploads_first_and_retains_legacy_bytes(self):
        old_key = f"{self.company.id}/logo-{'a' * 32}.png"
        self.company.logo_storage_path = old_key
        self.company.logo_data = b"legacy-backup"
        self.company.save()

        def check_old_reference(*args, **kwargs):
            self.company.refresh_from_db()
            self.assertEqual(self.company.logo_storage_path, old_key)
            return Mock(status_code=201)

        with patch.object(storage.requests, "post", side_effect=check_old_reference):
            response = self.acting(self.hr).post(self.url, {"logo": self.photo()}, format="multipart")
        self.assertEqual(response.status_code, 200)
        self.company.refresh_from_db()
        self.assertNotEqual(self.company.logo_storage_path, old_key)
        self.assertEqual(bytes(self.company.logo_data), b"legacy-backup")

    def test_failed_upload_preserves_old_reference_and_binary(self):
        self.company.logo_storage_path = f"{self.company.id}/logo-{'a' * 32}.png"
        self.company.logo_url = "https://example.test/old.png"
        self.company.logo_data = b"old"
        self.company.save()
        before = Company.objects.values().get(pk=self.company.id)
        for failure in [Mock(status_code=503), requests.Timeout()]:
            with self.subTest(failure=type(failure).__name__):
                with patch.object(storage.requests, "post", **({"side_effect": failure} if isinstance(failure, Exception) else {"return_value": failure})):
                    result = self.acting(self.hr).post(self.url, {"logo": self.photo()}, format="multipart")
                self.assertEqual(result.status_code, 503)
                self.assertEqual(Company.objects.values().get(pk=self.company.id), before)

    def test_legacy_logos_and_empty_companies_need_no_storage_access(self):
        with patch.object(storage.requests, "get") as download:
            self.assertEqual(self.public.get(self.url).status_code, 404)
            legacy = self.photo().read()
            self.company.logo_data = legacy
            self.company.save()
            result = self.public.get(self.url)
            self.assertEqual(result.content, legacy)
            download.assert_not_called()

    def test_storage_read_failure_returns_existing_error_style_without_credentials(self):
        self.company.logo_storage_path = f"{self.company.id}/logo-{'a' * 32}.png"
        self.company.save()
        with patch.object(storage.requests, "get", side_effect=requests.Timeout("server-secret")):
            result = self.public.get(self.url)
        self.assertEqual(result.status_code, 503)
        self.assertIn("error", result.data)
        self.assertNotIn("server-secret", str(result.data))

    def test_logo_storage_reference_cannot_be_set_through_company_settings(self):
        response = self.acting(self.hr).patch(
            f"/api/v1/companies/{self.company.id}/",
            {"logo_storage_path": f"{self.other.id}/logo-{'a' * 32}.png"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.company.refresh_from_db()
        self.assertEqual(self.company.logo_storage_path, "")
        self.assertNotIn("logo_storage_path", response.data)

    def test_unauthorised_uploads_invalid_files_and_cross_company_paths_are_rejected(self):
        with patch.object(storage.requests, "post") as upload:
            for client in [self.acting(self.other_hr), self.acting(self.employee), self.public]:
                self.assertIn(client.post(self.url, {"logo": self.photo()}, format="multipart").status_code, [401, 403])
            invalid = SimpleUploadedFile("bad.png", b"not an image", content_type="image/png")
            self.assertEqual(self.acting(self.hr).post(self.url, {"logo": invalid}, format="multipart").status_code, 400)
            upload.assert_not_called()
        for key in [f"{self.other.id}/logo-{'a' * 32}.png", f"{self.company.id}/../other.png", "https://example.test/logo.png"]:
            self.company.logo_storage_path = key
            self.company.save()
            with patch.object(storage.requests, "get") as download:
                self.assertEqual(self.public.get(self.url).status_code, 404)
                download.assert_not_called()
