from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.test import TestCase
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APIClient

from apps.accounts.services import send_access_email
from apps.companies.models import Company
from apps.organisation.services import set_manager
from tests import test_foundation


class GrowthInvitationTests(TestCase):
    person = test_foundation.FoundationTests.person
    acting = test_foundation.FoundationTests.acting

    def setUp(self):
        self.company = Company.objects.create(name="Atlas", slug="atlas")
        self.other = Company.objects.create(name="Other", slug="other")
        self.hr = self.person("hr", self.company, hr=True)
        self.manager = self.person("manager", self.company, manager=True)
        self.me = self.person("me", self.company)
        self.foreign = self.person("foreign", self.other)
        set_manager(self.hr, self.me.profile.id, self.manager.profile.id, 1)
        self.client = self.acting(self.me)

    def entry(self, **changes):
        body = {
            "kind": "CONTRIBUTION",
            "category": "Mentoring",
            "title": "Handover coaching",
            "details": "Helped a colleague own handovers.",
        }
        body.update(changes)
        r = self.client.post("/api/v1/growth/", body, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        return r.data

    def test_private_journal_shared_only_when_selected_and_only_author_edits(self):
        entry = self.entry()
        url = f"/api/v1/growth/{entry['id']}/"
        manager = self.acting(self.manager)
        self.assertEqual(manager.get(url).status_code, 404)
        self.assertEqual(self.acting(self.hr).get(url).status_code, 404)
        self.assertEqual(
            self.client.patch(url, {"version": 1, "shared": True}, format="json").status_code, 200
        )
        self.assertEqual(manager.get(url).status_code, 200)
        self.assertEqual(
            manager.patch(url, {"version": 2, "title": "Changed"}, format="json").status_code, 403
        )
        self.assertEqual(self.acting(self.foreign).get(url).status_code, 404)
        self.assertEqual(
            self.client.patch(url, {"version": 1, "title": "Stale"}, format="json").status_code, 409
        )

    def test_manager_capability_observation_is_shared_and_separate(self):
        self.client = self.acting(self.manager)
        entry = self.entry(kind="CAPABILITY", category="Strategic Judgment", subject=str(self.me.profile.id))
        self.assertTrue(entry["shared"])
        self.assertEqual(entry["perspective"], "MANAGER")
        r = self.acting(self.me).get("/api/v1/growth/?kind=CAPABILITY&perspective=MANAGER")
        self.assertEqual(r.data["count"], 1)
        self.assertEqual(
            self.acting(self.me).get("/api/v1/growth/?kind=CAPABILITY&perspective=SELF").data["count"], 0
        )

    def test_foreign_subject_and_invalid_category_are_rejected(self):
        r = self.client.post(
            "/api/v1/growth/",
            {
                "kind": "CAPABILITY",
                "category": "Strategic Judgment",
                "subject": str(self.foreign.profile.id),
                "title": "No access",
                "details": "Unauthorised observation",
            },
            format="json",
        )
        self.assertEqual(r.status_code, 403)
        r = self.client.post(
            "/api/v1/growth/", {"kind": "LEGACY", "category": "Invented", "title": "Invalid", "details": "Invalid category"}, format="json"
        )
        self.assertEqual(r.status_code, 400)

    def test_archived_records_are_recoverable_and_hidden_by_default(self):
        entry = self.entry()
        url = f"/api/v1/growth/{entry['id']}/"
        self.client.patch(url, {"version": 1, "archived": True}, format="json")
        self.assertEqual(self.client.get("/api/v1/growth/").data["count"], 0)
        self.assertEqual(self.client.get("/api/v1/growth/?archived=true").data["count"], 1)
        self.assertEqual(
            self.client.patch(url, {"version": 2, "archived": False}, format="json").status_code, 200
        )

    def test_invitation_accepts_once_and_preserves_workspace(self):
        user = self.me.user
        user.set_unusable_password()
        user.save()
        send_access_email(user)
        self.assertIn("/auth/accept-invitation?", mail.outbox[-1].body)
        token = {
            "uid": urlsafe_base64_encode(force_bytes(user.pk)),
            "token": default_token_generator.make_token(user),
        }
        client = APIClient()
        r = client.post("/api/v1/auth/invitation/", token, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["email"], user.email)
        data = {
            **token,
            "accept": True,
            "first_name": "Bradley",
            "last_name": "Emerson",
            "password": "Long-invitation-secret-123!",
            "confirm_password": "Long-invitation-secret-123!",
        }
        r = client.post("/api/v1/auth/invitation/", data, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        user.refresh_from_db()
        self.assertEqual(user.get_full_name(), "Bradley Emerson")
        self.assertTrue(user.check_password(data["password"]))
        self.assertEqual(client.post("/api/v1/auth/invitation/", data, format="json").status_code, 400)

    def test_invitation_does_not_accept_existing_account_reset_token(self):
        user = self.me.user
        token = {
            "uid": urlsafe_base64_encode(force_bytes(user.pk)),
            "token": default_token_generator.make_token(user),
        }
        self.assertEqual(APIClient().post("/api/v1/auth/invitation/", token, format="json").status_code, 400)
