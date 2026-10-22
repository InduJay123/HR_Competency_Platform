from tests.portal_helpers import bind_admin_portal
import io
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase
from PIL import Image
from rest_framework.test import APIClient

from apps.companies.models import Company
from apps.evidence.storage import StorageUnavailable
from tests import test_foundation


class ProfilePictureStorageTests(TestCase):
    person = test_foundation.FoundationTests.person
    acting = test_foundation.FoundationTests.acting
    url = "/api/v1/auth/profile/photo/"

    def setUp(self):
        self.company = Company.objects.create(name="Pictures", slug="pictures")
        self.hr = self.person("head", self.company, hr=True)
        self.me = self.person("owner", self.company)
        self.other = self.person("other", self.company)
        self.client = self.acting(self.me)
        self.put = patch("apps.evidence.storage.put").start()
        self.addCleanup(patch.stopall)

    def photo(self, fmt="PNG", ext="png", mime="image/png"):
        output = io.BytesIO()
        Image.new("RGB", (20, 30), "red").save(output, fmt)
        return SimpleUploadedFile(f"picture.{ext}", output.getvalue(), mime)

    def upload(self, photo=None, version=1, **extra):
        return self.client.post(self.url, {"photo": photo or self.photo(), "version": version, **extra}, format="multipart")

    def test_supported_formats_store_only_reference(self):
        for version, (fmt, ext, mime) in enumerate([
            ("JPEG", "jpg", "image/jpeg"), ("JPEG", "jpeg", "image/jpeg"),
            ("PNG", "png", "image/png"), ("WEBP", "webp", "image/webp"),
        ], start=1):
            with self.subTest(fmt=fmt, ext=ext):
                result = self.upload(self.photo(fmt, ext, mime), version)
                self.assertEqual(result.status_code, 200)
                user = get_user_model().objects.get(pk=self.me.user_id)
                self.assertEqual(user.profile_picture_storage_path, f"users/{user.id}/avatar.png")
                self.assertEqual(user.profile_picture_version, version)
                profile = self.me.profile
                profile.refresh_from_db()
                self.assertIsNone(profile.avatar_data)
                self.assertEqual(profile.photo_url, "")
                self.assertEqual(result.data["photo_url"], f"/api/v1/employees/{profile.id}/photo/?v={version}")
                self.assertEqual(self.put.call_args.kwargs, {"bucket": "profile-pictures", "upsert": True})

    def test_invalid_files_never_reach_storage(self):
        files = [
            SimpleUploadedFile("x.gif", b"GIF89a", "image/gif"),
            SimpleUploadedFile("x.png", b"", "image/png"),
            SimpleUploadedFile("x.png", b"x" * (5 * 1024 * 1024 + 1), "image/png"),
            SimpleUploadedFile("x.png", b"fake", "image/png"),
            self.photo(mime="text/plain"),
            self.photo(ext="jpg", mime="image/jpeg"),
        ]
        for file in files:
            with self.subTest(name=file.name, size=file.size):
                response = self.client.post(self.url, {"photo": file, "version": 1}, format="multipart")
                self.assertEqual(response.status_code, 400)
        self.put.assert_not_called()

    def test_anonymous_rejected(self):
        self.assertEqual(APIClient().post(self.url, {"photo": self.photo()}, format="multipart").status_code, 403)
        self.assertEqual(APIClient().get(self.url).status_code, 403)
        self.put.assert_not_called()

    def test_identity_is_session_owned_and_reads_are_private(self):
        result = self.upload(user_id=str(self.other.user_id), profile_picture_storage_path="someone/else.png")
        self.assertEqual(result.status_code, 200)
        self.other.user.refresh_from_db()
        self.assertEqual(self.other.user.profile_picture_storage_path, "")
        self.assertEqual(self.acting(self.other).get(result.data["photo_url"]).status_code, 404)
        self.assertEqual(self.client.post(f"/api/v1/employees/{self.other.profile.id}/photo/", {}).status_code, 405)
        with patch("apps.evidence.storage.get", return_value=b"image") as get:
            response = self.client.get(result.data["photo_url"])
        self.assertEqual(response.content, b"image")
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertEqual(get.call_args.kwargs, {"bucket": "profile-pictures"})

    def test_failure_and_stale_version_preserve_existing_picture(self):
        first = self.upload()
        self.put.side_effect = StorageUnavailable()
        self.assertEqual(self.upload(version=2).status_code, 503)
        self.assertEqual(self.client.get("/api/v1/auth/profile/").data["photo_url"], first.data["photo_url"])
        self.me.user.refresh_from_db()
        self.assertEqual(self.me.user.profile_picture_version, 1)
        self.put.reset_mock()
        self.assertEqual(self.upload(version=1).status_code, 409)
        self.put.assert_not_called()

    def test_no_picture_fallback_and_remove(self):
        self.assertEqual(self.client.get("/api/v1/auth/profile/").data["photo_url"], "")
        self.assertEqual(self.client.get(self.url).status_code, 404)
        self.upload()
        result = self.client.patch("/api/v1/auth/profile/", {"version": 2, "remove_photo": True}, format="json")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data["photo_url"], "")
        self.assertEqual(self.client.get(self.url).status_code, 404)

    def test_platform_admin_without_membership(self):
        admin = get_user_model().objects.create_superuser(username="admin", email="admin@example.test", password="secret")
        client = APIClient()
        client.force_login(admin)
        bind_admin_portal(client)
        result = client.post(self.url, {"photo": self.photo()}, format="multipart")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data["photo_url"], self.url + "?v=1")
        self.assertEqual(client.get("/api/v1/auth/session/").data["user"]["photo_url"], result.data["photo_url"])

    def test_chief_steward_can_upload(self):
        response = self.acting(self.hr).post(self.url, {"photo": self.photo(), "version": 1}, format="multipart")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.put.call_args.args[0], f"users/{self.hr.user_id}/avatar.png")

    def test_legacy_migration_is_retryable_and_preserves_data_on_failure(self):
        profile = self.me.profile
        profile.avatar_data = self.photo().read()
        profile.save()
        self.put.side_effect = StorageUnavailable()
        with self.assertRaises(StorageUnavailable):
            call_command("migrate_profile_pictures", stdout=io.StringIO())
        profile.refresh_from_db()
        self.assertTrue(profile.avatar_data)
        self.put.side_effect = None
        call_command("migrate_profile_pictures", stdout=io.StringIO())
        profile.refresh_from_db()
        self.assertIsNone(profile.avatar_data)
        self.put.reset_mock()
        call_command("migrate_profile_pictures", stdout=io.StringIO())
        self.put.assert_not_called()

    def test_corrupt_storage_reference_is_not_proxied(self):
        user = self.me.user
        user.profile_picture_storage_path = "users/another-user/avatar.png"
        user.save()
        with patch("apps.evidence.storage.get") as get:
            self.assertEqual(self.client.get(self.url).status_code, 404)
        get.assert_not_called()
