import io
from unittest.mock import Mock, patch

import requests
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image

from apps.ai_coach.models import TrainerConversation, TrainerMessage
from apps.companies.models import Company
from tests import test_foundation


class ProfileTrainerTests(TestCase):
    person = test_foundation.FoundationTests.person
    acting = test_foundation.FoundationTests.acting

    def setUp(self):
        self.company = Company.objects.create(name="Atlas", slug="atlas")
        self.other = Company.objects.create(name="Other", slug="other")
        self.me = self.person("me", self.company)
        self.peer = self.person("peer", self.company)
        self.foreign = self.person("foreign", self.other)
        self.client = self.acting(self.me)

    def test_self_profile_fields_save_without_changing_access_or_login(self):
        r = self.client.patch(
            "/api/v1/auth/profile/",
            {
                "version": 1,
                "first_name": "Bradley",
                "last_name": "Emerson",
                "phone": "+94 77 123 4567",
                "contact_email": "contact@example.test",
                "employment_company": "Professional Company",
                "designation": "Learning Lead",
                "bio": "I enjoy mentoring.",
                "location": "Colombo",
                "skills": "Coaching",
                "is_hr": True,
                "company_id": str(self.other.id),
                "email": "changed@example.test",
            },
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["first_name"], "Bradley")
        self.assertEqual(r.data["phone"], "+94 77 123 4567")
        self.assertEqual(r.data["designation"], "Learning Lead")
        self.me.refresh_from_db()
        self.assertFalse(self.me.is_hr)
        self.assertEqual(self.me.company_id, self.company.id)
        self.assertEqual(r.data["email"], "me@example.test")
        self.assertEqual(
            self.client.patch(
                "/api/v1/auth/profile/", {"version": 1, "bio": "stale"}, format="json"
            ).status_code,
            409,
        )

    def test_profile_contact_fields_are_not_in_directory_payload(self):
        r = self.client.get("/api/v1/employees/")
        self.assertEqual(r.status_code, 200)
        self.assertNotIn("phone", r.data["results"][0])
        self.assertNotIn("contact_email", r.data["results"][0])

    def test_avatar_upload_authorisation_and_validation(self):
        photo = io.BytesIO()
        Image.new("RGB", (20, 40), "blue").save(photo, "PNG")
        r = self.client.post(
            "/api/v1/auth/profile/photo/",
            {"version": 1, "photo": SimpleUploadedFile("photo.png", photo.getvalue(), "image/png")},
            format="multipart",
        )
        self.assertEqual(r.status_code, 200)
        url = r.data["photo_url"]
        self.assertEqual(self.client.get("/api/v1/employees/").data["results"][0]["photo_url"], url)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Image.open(io.BytesIO(response.content)).size, (256, 256))
        self.assertEqual(self.acting(self.foreign).get(url).status_code, 404)
        self.assertEqual(self.acting(self.peer).get(url).status_code, 404)
        bad = self.client.post(
            "/api/v1/auth/profile/photo/",
            {"version": 2, "photo": SimpleUploadedFile("fake.png", b"not an image", "image/png")},
            format="multipart",
        )
        self.assertEqual(bad.status_code, 400)

    def conversation(self):
        return TrainerConversation.objects.create(company=self.company, owner=self.me, title="Learning")

    def test_chat_is_private_to_owner_and_tenant(self):
        c = self.conversation()
        url = f"/api/v1/trainer/conversations/{c.id}/messages/"
        self.assertEqual(self.acting(self.peer).get(url).status_code, 404)
        self.assertEqual(self.acting(self.foreign).get(url).status_code, 404)

    @override_settings(OPENAI_API_KEY="", OPENAI_TRAINER_MODEL="")
    def test_missing_configuration_does_not_fabricate_reply(self):
        c = self.conversation()
        with patch("apps.ai_coach.trainer.requests.post") as provider:
            r = self.client.post(
                f"/api/v1/trainer/conversations/{c.id}/messages/",
                {"content": "Help me delegate"},
                format="json",
            )
        self.assertEqual(r.status_code, 503)
        provider.assert_not_called()
        self.assertFalse(TrainerMessage.objects.exists())

    @override_settings(OPENAI_API_KEY="test-only", OPENAI_TRAINER_MODEL="configured-test-model")
    def test_live_adapter_sends_only_conversation_and_persists_reply(self):
        c = self.conversation()
        result = Mock(content=b"valid")
        result.json.return_value = {
            "status": "completed",
            "output": [
                {
                    "type": "message",
                    "content": [{"type": "output_text", "text": "Agree a clear outcome first."}],
                }
            ],
        }
        with patch("apps.ai_coach.trainer.requests.post", return_value=result) as provider:
            r = self.client.post(
                f"/api/v1/trainer/conversations/{c.id}/messages/",
                {"content": "Help me delegate"},
                format="json",
            )
        self.assertEqual(r.status_code, 200)
        body = provider.call_args.kwargs["json"]
        self.assertFalse(body["store"])
        self.assertEqual(body["input"], [{"role": "user", "content": "Help me delegate"}])
        self.assertEqual(c.messages.count(), 2)
        c.refresh_from_db()
        self.assertFalse(c.busy)

    @override_settings(OPENAI_API_KEY="test-only", OPENAI_TRAINER_MODEL="configured-test-model")
    def test_provider_timeout_releases_lock_and_does_not_save_fake_messages(self):
        c = self.conversation()
        with patch("apps.ai_coach.trainer.requests.post", side_effect=requests.Timeout):
            r = self.client.post(
                f"/api/v1/trainer/conversations/{c.id}/messages/", {"content": "Help me plan"}, format="json"
            )
        self.assertEqual(r.status_code, 502)
        self.assertFalse(c.messages.exists())
        c.refresh_from_db()
        self.assertFalse(c.busy)
