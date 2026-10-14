from django.core.management.base import BaseCommand, CommandError
from django.db import connection


class Command(BaseCommand):
    help = 'Read-only reporting preflight, compatible with both old and new schema.'

    def handle(self, *args, **options):
        problems = []
        with connection.cursor() as cursor:
            cursor.execute('''SELECT c.id, COUNT(m.id) FROM companies_company c
                LEFT JOIN companies_membership m ON m.company_id=c.id
                AND m.active AND m.is_head_hr GROUP BY c.id ORDER BY c.id''')
            for company, count in cursor.fetchall():
                self.stdout.write(f'{company}: {count} active Head(s) of HR')
                if count != 1:
                    problems.append(str(company))
            cursor.execute('''SELECT m.company_id FROM companies_membership m
                LEFT JOIN organisation_employeeprofile p ON p.membership_id=m.id AND p.company_id=m.company_id
                JOIN accounts_user u ON u.id=m.user_id
                WHERE m.active AND m.is_head_hr AND (p.id IS NULL OR u.is_superuser)''')
            problems.extend(str(row[0]) for row in cursor.fetchall())
            cursor.execute('''SELECT p.id FROM organisation_employeeprofile p
                JOIN companies_membership m ON m.id=p.membership_id WHERE p.company_id<>m.company_id''')
            problems.extend(f'profile mismatch {row[0]}' for row in cursor.fetchall())
            cursor.execute('''SELECT r.id FROM reviews_review r
                JOIN organisation_employeeprofile p ON p.id=r.employee_id
                JOIN companies_membership m ON m.id=p.membership_id
                WHERE m.active AND m.is_head_hr AND r.state<>'FINALISED' ''')
            problems.extend(f'unfinished Head of HR review {row[0]}' for row in cursor.fetchall())
            if 'organisation_reportingrelationship' in connection.introspection.table_names():
                cursor.execute('SELECT COUNT(*) FROM organisation_reportingrelationship')
                self.stdout.write(f'Legacy reporting links: {cursor.fetchone()[0]}')
        if problems:
            raise CommandError('Reporting conflicts: ' + ', '.join(problems))
        self.stdout.write(self.style.SUCCESS('Reporting preflight passed. No data changed.'))
