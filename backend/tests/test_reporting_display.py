from unittest.mock import patch

from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination

from apps.companies.models import Company, Membership
from apps.organisation.serializers import EmployeeSerializer
from apps.organisation.services import effective_manager
from tests.test_foundation import FoundationTests


class ReportingDisplayTests(TestCase):
    person = FoundationTests.person
    acting = FoundationTests.acting

    def setUp(self):
        self.company = Company.objects.create(name='Reporting', slug='reporting')
        self.hr = self.person('head', self.company, hr=True)
        self.employee = self.person('employee', self.company)
        self.peer = self.person('peer', self.company)

    def test_effective_manager_and_read_only_identity(self):
        self.assertIsNone(effective_manager(self.hr.profile))
        self.assertEqual(effective_manager(self.employee.profile), self.hr.profile)
        data = EmployeeSerializer(self.employee.profile).data
        self.assertEqual(data['manager_id'], str(self.hr.profile.id))
        self.assertEqual(data['manager_name'], 'Head Test')
        self.assertNotIn('is_manager', data)
        self.assertIsNone(EmployeeSerializer(self.hr.profile).data['manager_id'])
        client = self.acting(self.employee)
        self.assertEqual(client.get(f'/api/v1/employees/{self.hr.profile.id}/').status_code, 404)
        self.assertEqual(client.get('/api/v1/employees/').data['count'], 1)

    def test_pagination_and_search_do_not_control_head_resolution(self):
        with patch.object(PageNumberPagination, 'page_size', 1):
            page = self.acting(self.hr).get('/api/v1/employees/?scope=team&page=2')
        self.assertEqual(page.data['results'][0]['manager_name'], 'Head Test')
        result = self.acting(self.employee).get('/api/v1/employees/?search=employee')
        self.assertEqual(result.data['results'][0]['manager_name'], 'Head Test')

    def test_duplicate_head_rejected_by_database(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Membership.objects.filter(pk=self.peer.id).update(is_head_hr=True, is_hr=True)

    def test_missing_head_fails_closed(self):
        Membership.objects.filter(pk=self.hr.id).update(is_head_hr=False)
        with self.assertRaises(ValidationError):
            effective_manager(self.employee.profile)

    def test_head_cannot_be_deactivated(self):
        response = self.acting(self.hr).patch(f'/api/v1/employees/{self.hr.profile.id}/',
            {'version': 1, 'active': False}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_normal_employee_cannot_select_manager_workspace_or_login_role(self):
        client = self.acting(self.employee)
        response = client.post('/api/v1/auth/context/',
            {'company_id': str(self.company.id), 'context': 'manager'}, format='json')
        self.assertEqual(response.status_code, 403)
        session = client.session
        session['context'] = 'manager'
        session.save()
        self.assertEqual(client.get('/api/v1/auth/session/').data['context'], 'employee')
        self.assertNotIn('manager', self.employee.contexts)
        self.assertIn('manager', self.hr.contexts)

    def test_tenant_isolation(self):
        other = Company.objects.create(name='Other', slug='other')
        other_head = self.person('other-head', other, hr=True)
        foreign = self.person('foreign', other)
        self.assertEqual(effective_manager(foreign.profile), other_head.profile)
        self.assertEqual(self.acting(self.hr).get(f'/api/v1/employees/{foreign.profile.id}/').status_code, 404)
