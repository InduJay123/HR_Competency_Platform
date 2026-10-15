from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.test import TestCase
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APIClient

from apps.accounts.services import send_access_email
from apps.companies.models import Company
from apps.organisation.models import GrowthEntry
from tests import test_foundation


class GrowthInvitationTests(TestCase):
    person = test_foundation.FoundationTests.person
    acting = test_foundation.FoundationTests.acting

    def setUp(self):
        self.company = Company.objects.create(name="Atlas", slug="atlas")
        self.other = Company.objects.create(name="Other", slug="other")
        self.hr = self.person("hr", self.company, hr=True)
        self.manager = self.hr
        self.me = self.person("me", self.company)
        self.foreign = self.person("foreign", self.other)
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

    def test_chief_cannot_create_personal_or_steward_entries(self):
        client = self.acting(self.manager)
        for subject in [None, str(self.manager.profile.id), str(self.me.profile.id)]:
            for kind, category in [("CONTRIBUTION", "Mentoring"), ("CAPABILITY", "Strategic Judgment"), ("LEGACY", "People")]:
                body = {"kind": kind, "category": category, "title": "Denied", "details": "Read only"}
                if subject:
                    body["subject"] = subject
                self.assertEqual(client.post("/api/v1/growth/", body, format="json").status_code, 403)
        self.assertFalse(GrowthEntry.objects.exists())

    def legacy_observation(self):
        return GrowthEntry.objects.create(company=self.company, owner=self.manager, subject=self.me.profile,
            kind="CAPABILITY", category="Strategic Judgment", title="Historical observation", details="Preserved", shared=True)

    def test_historical_observations_preserved_read_only_for_recipient(self):
        entry = self.legacy_observation()
        url = f"/api/v1/growth/{entry.id}/"
        response = self.acting(self.me).get(url)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["can_edit"])
        self.assertEqual(self.acting(self.me).patch(url, {"version": 1, "details": "Changed"}, format="json").status_code, 403)
        self.assertEqual(self.acting(self.manager).get(url).status_code, 404)
        entry.refresh_from_db()
        self.assertEqual(entry.details, "Preserved")

    def test_team_reads_only_selected_employees_shared_records_for_all_tools(self):
        other_manager = self.person("other-manager", self.company, manager=True)
        unrelated = self.person("unrelated", self.company)
        teammate = self.person("teammate", self.company)
        for kind, category in [("CONTRIBUTION", "Mentoring"), ("CAPABILITY", "Strategic Judgment"), ("LEGACY", "People")]:
            with self.subTest(kind=kind):
                self.client = self.acting(self.me)
                private = self.entry(kind=kind, category=category)
                shared = self.entry(kind=kind, category=category, shared=True)
                self.client = self.acting(teammate)
                self.entry(kind=kind, category=category, shared=True)
                self.client = self.acting(self.manager)
                GrowthEntry.objects.create(company=self.company, owner=self.manager, subject=self.manager.profile, kind=kind, category=category, title="Historical personal", details="Keep", shared=True)
                before = list(GrowthEntry.objects.order_by("id").values())
                query = f"/api/v1/growth/?scope=team&subject={self.me.profile.id}&kind={kind}"
                response = self.client.get(query)
                self.assertEqual(response.status_code, 200)
                self.assertEqual([x["id"] for x in response.data["results"]], [shared["id"]])
                self.assertFalse(response.data["results"][0]["can_edit"])
                self.assertEqual(self.client.get(f"/api/v1/growth/?kind={kind}").data["count"], 2)
                personal = self.acting(self.me).get(f"/api/v1/growth/?kind={kind}")
                self.assertEqual({x["id"] for x in personal.data["results"]}, {private["id"], shared["id"]})
                for outsider in [other_manager, unrelated, self.foreign]:
                    client = self.acting(outsider)
                    self.assertEqual(client.get(query).data["count"], 0)
                    self.assertEqual(client.get(query.replace("scope=team&", "")).data["count"], 0)
                    self.assertEqual(client.get(f"/api/v1/growth/{shared['id']}/").status_code, 404)
                self.assertEqual(self.client.get(f"/api/v1/growth/{private['id']}/?scope=team").status_code, 404)
                self.assertEqual(self.client.patch(f"/api/v1/growth/{shared['id']}/", {"version": 1, "details": "Changed"}, format="json").status_code, 403)
                self.assertEqual(self.client.delete(f"/api/v1/growth/{shared['id']}/").status_code, 405)
                self.assertEqual(list(GrowthEntry.objects.order_by("id").values()), before)
        for subject in ["", "invalid", str(self.manager.profile.id)]:
            self.assertEqual(self.client.get(f"/api/v1/growth/?scope=team&subject={subject}").data["count"], 0)
        self.assertEqual(self.client.get("/api/v1/growth/?scope=team").data["count"], 6)

    def test_existing_records_follow_current_reporting_assignment_without_changes(self):
        shared = self.entry(shared=True)
        private = self.entry()
        new_manager = self.person("new-manager", self.company, manager=True)
        query = f"/api/v1/growth/?scope=team&subject={self.me.profile.id}"
        self.assertEqual(self.acting(self.manager).get(query).data["count"], 1)
        before = list(GrowthEntry.objects.order_by("id").values())
        from apps.companies.models import Membership
        Membership.objects.filter(pk=self.hr.pk).update(is_head_hr=False)
        Membership.objects.filter(pk=new_manager.pk).update(is_head_hr=True, is_hr=True)
        self.assertEqual(self.acting(self.manager).get(query).data["count"], 0)
        self.assertEqual(self.acting(self.manager).get(f"/api/v1/growth/{shared['id']}/").status_code, 404)
        self.assertEqual(self.acting(new_manager).get(query).data["results"][0]["id"], shared["id"])
        self.assertEqual(self.acting(new_manager).get(f"/api/v1/growth/{private['id']}/").status_code, 404)
        self.assertEqual(list(GrowthEntry.objects.order_by("id").values()), before)

    def test_team_scope_preserves_capability_observations_but_requires_current_assignment(self):
        self.client = self.acting(self.manager)
        observation = self.legacy_observation()
        query = f"/api/v1/growth/?scope=team&subject={self.me.profile.id}&perspective=MANAGER"
        self.assertEqual(self.client.get(query).data["count"], 0)
        from apps.companies.models import Membership
        replacement = self.person("replacement", self.company)
        Membership.objects.filter(pk=self.hr.pk).update(is_head_hr=False)
        Membership.objects.filter(pk=replacement.pk).update(is_head_hr=True, is_hr=True)
        self.assertEqual(self.client.get(query).data["count"], 0)
        self.assertEqual(self.client.get(f"/api/v1/growth/{observation.id}/?scope=team").status_code, 404)

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

    def test_unsharing_revokes_chief_access_and_peer_cannot_write(self):
        entry = self.entry(shared=True)
        url = f"/api/v1/growth/{entry['id']}/"
        peer = self.person("peer", self.company)
        peer_client = self.acting(peer)
        self.assertEqual(peer_client.patch(url, {"version": 1, "title": "Hijack"}, format="json").status_code, 404)
        self.assertEqual(peer_client.post("/api/v1/growth/", {
            "subject": str(self.me.profile.id), "kind": "CAPABILITY", "category": "Strategic Judgment",
            "title": "Hijack", "details": "Another person's entry",
        }, format="json").status_code, 403)
        self.assertEqual(self.client.patch(url, {"version": 1, "shared": False}, format="json").status_code, 200)
        self.assertEqual(self.acting(self.hr).get(url).status_code, 404)
        self.assertEqual(self.acting(self.hr).get("/api/v1/growth/").data["count"], 0)
        self.assertEqual(self.client.get(url).status_code, 200)
        self.assertEqual(self.client.delete(url).status_code, 405)

    def test_foreign_chief_and_inactive_subject_are_excluded(self):
        entry = self.entry(shared=True)
        foreign_chief = self.person("foreign-chief", self.other, hr=True)
        client = self.acting(foreign_chief)
        self.assertEqual(client.get("/api/v1/growth/?scope=team").data["count"], 0)
        self.assertEqual(client.get(f"/api/v1/growth/{entry['id']}/").status_code, 404)
        self.me.active = False
        self.me.save()
        self.assertEqual(self.acting(self.hr).get("/api/v1/growth/?scope=team").data["count"], 0)

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
