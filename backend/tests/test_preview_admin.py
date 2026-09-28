import io
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from apps.companies.models import Company, Membership


class PreviewAdminTests(TestCase):
    def setUp(self):
        Company.objects.create(name="Preview", slug="atlas-demo")

    def create(self):
        with patch.dict("os.environ", {"BFL_PREVIEW_PASSWORD": "test-only-password"}):
            call_command(
                "create_preview_admin",
                email="preview@example.test",
                first_name="Bradly",
                last_name="Emerson",
                stdout=io.StringIO(),
            )

    @override_settings(DEBUG=False)
    def test_disabled_in_production(self):
        with self.assertRaises(CommandError):
            self.create()
        self.assertEqual(get_user_model().objects.count(), 0)

    @override_settings(DEBUG=True)
    def test_preview_has_tenant_admin_roles_without_global_superuser(self):
        self.create()
        member = Membership.objects.get()
        self.assertTrue(member.is_hr and member.is_head_hr and member.is_manager)
        self.assertEqual(member.user.get_full_name(), "Bradly Emerson")
        self.assertFalse(member.user.is_superuser)
        self.assertIsNone(member.profile.joined_on)

    @override_settings(DEBUG=True)
    def test_existing_identity_cannot_be_overwritten(self):
        self.create()
        before = get_user_model().objects.get().password
        with self.assertRaises(CommandError):
            self.create()
        self.assertEqual(get_user_model().objects.get().password, before)
