"""Exercise the real migration graph on a separate, disposable SQLite database."""
from copy import deepcopy
from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import patch
from uuid import uuid4

from django.db import connections
from django.db.migrations.executor import MigrationExecutor


class ReportingMigrationTests(TestCase):
    alias = 'reporting_migration_test'
    old_targets = [
        ('companies', '0006_clear_legacy_local_logo_urls'),
        ('organisation', '0004_growthentry'),
        ('reviews', '0005_review_employee_comments'),
    ]

    def setUp(self):
        self.directory = TemporaryDirectory()
        config = deepcopy(connections['default'].settings_dict)
        self.postgres_database = None
        if connections['default'].vendor == 'postgresql':
            self.postgres_database = 'test_reporting_migration_' + uuid4().hex
            with connections['default'].cursor() as cursor:
                cursor.execute('CREATE DATABASE ' + connections['default'].ops.quote_name(self.postgres_database))
            config['NAME'] = self.postgres_database
        else:
            config.update(ENGINE='django.db.backends.sqlite3', NAME=str(Path(self.directory.name) / 'migration.sqlite3'), OPTIONS={})
        connections.databases[self.alias] = config
        self.connection = connections[self.alias]
        self.addCleanup(self.cleanup_database)
        # Older project migrations use unqualified historical managers. Route
        # those to this disposable database too, never the runner/default DB.
        for operation in ('db_for_read', 'db_for_write'):
            routing = patch(f'django.db.router.{operation}', return_value=self.alias)
            routing.start()
            self.addCleanup(routing.stop)
        executor = MigrationExecutor(self.connection)
        executor.migrate(self.old_targets)
        self.apps = executor.loader.project_state(self.old_targets).apps

    def cleanup_database(self):
        self.connection.close()
        del connections[self.alias]
        del connections.databases[self.alias]
        if self.postgres_database:
            with connections['default'].cursor() as cursor:
                cursor.execute('DROP DATABASE ' + connections['default'].ops.quote_name(self.postgres_database))
        self.directory.cleanup()

    def rows(self, app, model):
        return self.apps.get_model(app, model).objects.using(self.alias)

    def person(self, company, name, head=False):
        user = self.rows('accounts', 'User').create(username=name, email=f'{name}@test.example')
        member = self.rows('companies', 'Membership').create(company=company, user=user, is_hr=head, is_head_hr=head, is_manager=not head)
        return self.rows('organisation', 'EmployeeProfile').create(company=company, membership=member)

    def migrate(self):
        executor = MigrationExecutor(self.connection)
        executor.migrate(executor.loader.graph.leaf_nodes())
        return executor.loader.project_state().apps

    def test_existing_chain_removed_and_business_records_preserved(self):
        company = self.rows('companies', 'Company').create(name='Company', slug='company')
        head = self.person(company, 'head', True)
        manager = self.person(company, 'manager')
        employee = self.person(company, 'employee')
        self.rows('organisation', 'ReportingRelationship').create(company=company, employee=manager, manager=head)
        self.rows('organisation', 'ReportingRelationship').create(company=company, employee=employee, manager=manager)
        cycle = self.rows('reviews', 'ReviewCycle').create(company=company, year=2026, kind='MID_YEAR', starts_on=date(2026,1,1), ends_on=date(2026,6,30), due_on=date(2026,7,1))
        review = self.rows('reviews', 'Review').create(company=company, cycle=cycle, employee=employee, manager=manager, reviewer=head.membership, state='FINALISED')
        self.rows('reviews', 'Submission').create(company=company, review=review, kind='MANAGER', round=1, author=manager.membership, content={'summary': 'Historical appraisal'})
        self.rows('reviews', 'FinalSnapshot').create(company=company, review=review, content={'preserved': True}, sha256='a' * 64)
        self.rows('organisation', 'GrowthEntry').create(company=company, owner=employee.membership, subject=employee, kind='LEGACY', category='People', title='Existing', details='Preserve', shared=True)
        self.rows('audit', 'AuditLog').create(company=company, actor=employee.membership.user, action='hierarchy.changed', object_id=str(employee.pk), metadata={'manager': str(manager.pk)})
        self.rows('companies', 'AccessRequest').create(user=employee.membership.user, company=company, kind='EMPLOYEE', status='APPROVED', details={'preserved': True})
        models = [('reviews', 'Review'), ('reviews', 'Submission'), ('reviews', 'FinalSnapshot'), ('organisation', 'EmployeeProfile'), ('organisation', 'GrowthEntry'), ('companies', 'Company'), ('companies', 'AccessRequest'), ('audit', 'AuditLog')]
        before = {(app, model): list(self.rows(app, model).order_by('id').values()) for app, model in models}
        final = self.migrate()
        for app, model in models:
            self.assertEqual(list(final.get_model(app, model).objects.using(self.alias).order_by('id').values()), before[(app, model)])
        self.assertNotIn('organisation_reportingrelationship', self.connection.introspection.table_names())
        with self.connection.cursor() as cursor:
            columns = self.connection.introspection.get_table_description(cursor, 'companies_membership')
        self.assertNotIn('is_manager', [column.name for column in columns])
        self.assertEqual(final.get_model('companies', 'Membership').objects.using(self.alias).count(), 3)

    def test_missing_head_blocks_before_dropping_or_normalizing(self):
        company = self.rows('companies', 'Company').create(name='Missing', slug='missing')
        manager = self.person(company, 'manager')
        employee = self.person(company, 'employee')
        link = self.rows('organisation', 'ReportingRelationship').create(company=company, employee=employee, manager=manager)
        with self.assertRaisesRegex(RuntimeError, '0 active Heads'):
            self.migrate()
        self.assertEqual(self.rows('organisation', 'ReportingRelationship').get(pk=link.pk).manager_id, manager.pk)
        self.assertIn('organisation_reportingrelationship', self.connection.introspection.table_names())

    def test_duplicate_heads_block_without_arbitrary_selection(self):
        company = self.rows('companies', 'Company').create(name='Duplicate', slug='duplicate')
        self.person(company, 'head1', True)
        self.person(company, 'head2', True)
        with self.assertRaisesRegex(RuntimeError, '2 active Heads'):
            self.migrate()
        self.assertEqual(self.rows('companies', 'Membership').filter(is_head_hr=True).count(), 2)

    def test_empty_database_migrates(self):
        self.migrate()
        self.assertNotIn('organisation_reportingrelationship', self.connection.introspection.table_names())

    def test_external_view_dependency_blocks_postgres_drop(self):
        if self.connection.vendor != 'postgresql':
            self.skipTest('PostgreSQL-specific dependency guard')
        with self.connection.cursor() as cursor:
            cursor.execute('CREATE VIEW reporting_extension AS SELECT id FROM organisation_reportingrelationship')
        with self.assertRaisesRegex(RuntimeError, 'dependent reporting view'):
            self.migrate()
        with self.connection.cursor() as cursor:
            cursor.execute('SELECT count(*) FROM reporting_extension')
            self.assertEqual(cursor.fetchone()[0], 0)

    def test_manager_flag_view_blocks_before_any_schema_cleanup(self):
        if self.connection.vendor != 'postgresql':
            self.skipTest('PostgreSQL-specific dependency guard')
        with self.connection.cursor() as cursor:
            cursor.execute('CREATE VIEW membership_extension AS SELECT is_manager FROM companies_membership')
        with self.assertRaisesRegex(RuntimeError, 'dependent manager-flag view'):
            self.migrate()
        self.assertIn('organisation_reportingrelationship', self.connection.introspection.table_names())
