from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from apps.companies.models import Membership, PlatformEvent
from tests import test_foundation as fixture


class HeadHrTransferTests(TestCase):
    person = fixture.FoundationTests.person
    acting = fixture.FoundationTests.acting

    def setUp(self):
        fixture.FoundationTests.setUp(self)
        self.admin = get_user_model().objects.create_user(username='platform', email='platform@test.example', is_superuser=True)

    def transfer(self, selected):
        call_command('set_head_hr', company=self.company.id, membership=selected.id,
            actor=self.admin.id, reason='Client-approved appointment', stdout=StringIO())

    def test_explicit_transfer_keeps_memberships_and_records_event(self):
        count = Membership.objects.count()
        self.transfer(self.sarah)
        self.assertEqual(Membership.objects.count(), count)
        self.assertEqual(Membership.objects.get(company=self.company, active=True, is_head_hr=True), self.sarah)
        event = PlatformEvent.objects.get(action='company.head_hr_selected')
        self.assertEqual(event.details['membership'], str(self.sarah.id))
        self.assertIn(str(self.hr.id).replace('-', ''), [str(value).replace('-', '') for value in event.details['previous']])

    def test_foreign_employee_is_not_selected(self):
        with self.assertRaises(CommandError):
            self.transfer(self.foreign)
        self.assertTrue(Membership.objects.get(pk=self.hr.pk).is_head_hr)

    def test_missing_head_is_repaired_only_by_explicit_selection(self):
        Membership.objects.filter(pk=self.hr.pk).update(is_head_hr=False)
        self.transfer(self.sarah)
        self.assertEqual(Membership.objects.get(company=self.company, active=True, is_head_hr=True), self.sarah)
