from uuid import UUID

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction


class Command(BaseCommand):
    help = 'Controlled Head of HR remediation/transfer using an explicitly selected existing membership. Never guesses.'

    def add_arguments(self, parser):
        parser.add_argument('--company', required=True, type=UUID)
        parser.add_argument('--membership', required=True, type=UUID)
        parser.add_argument('--actor', required=True, type=UUID)
        parser.add_argument('--reason', required=True)

    @transaction.atomic
    def handle(self, *args, **options):
        from django.contrib.auth import get_user_model

        from apps.companies.models import Company, PlatformEvent
        company = Company.objects.select_for_update().get(pk=options['company'])
        actor = get_user_model().objects.filter(pk=options['actor'], is_superuser=True, is_active=True).first()
        if not actor or not options['reason'].strip():
            raise CommandError('An active platform administrator and a reason are required.')
        # Explicit columns work before and after is_manager is removed. Parameterized
        # SQL is necessary for this pre-migration repair command, not normal writes.
        def key(value):
            return value if connection.vendor == 'postgresql' else value.hex
        with connection.cursor() as cursor:
            cursor.execute('''SELECT m.id FROM companies_membership m
                JOIN organisation_employeeprofile p ON p.membership_id=m.id AND p.company_id=m.company_id
                JOIN accounts_user u ON u.id=m.user_id
                WHERE m.id=%s AND m.company_id=%s AND m.active AND NOT u.is_superuser''',
                [key(options['membership']), key(company.id)])
            if not cursor.fetchone():
                raise CommandError('Choose an active employee membership with a same-company profile.')
            cursor.execute('''SELECT r.id FROM reviews_review r
                JOIN organisation_employeeprofile p ON p.id=r.employee_id
                WHERE p.membership_id=%s AND r.state<>'FINALISED' ''', [key(options['membership'])])
            if cursor.fetchone():
                raise CommandError('Finish this employee\'s open reviews before selecting them as Head of HR; self-appraisal is prohibited.')
            cursor.execute('SELECT id FROM companies_membership WHERE company_id=%s AND active AND is_head_hr', [key(company.id)])
            previous = [str(row[0]) for row in cursor.fetchall()]
            cursor.execute('UPDATE companies_membership SET is_head_hr=FALSE WHERE company_id=%s AND is_head_hr', [key(company.id)])
            cursor.execute('UPDATE companies_membership SET is_head_hr=TRUE, is_hr=TRUE WHERE id=%s', [key(options['membership'])])
        PlatformEvent.objects.create(actor=actor, company=company, action='company.head_hr_selected',
            details={'previous': previous, 'membership': str(options['membership']), 'reason': options['reason']})
        self.stdout.write('Head of HR selected; historical records and submissions preserved.')
