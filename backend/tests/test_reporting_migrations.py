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
            original_fields = list(before[(app, model)][0])
            self.assertEqual(list(final.get_model(app, model).objects.using(self.alias).order_by('id').values(*original_fields)), before[(app, model)])
        self.assertEqual(final.get_model('reviews', 'ReviewCycle').objects.using(self.alias).get(pk=cycle.pk).workflow_version, 1)
        self.assertEqual(final.get_model('reviews', 'Review').objects.using(self.alias).get(pk=review.pk).pillar_context, [])
        self.assertEqual(final.get_model('reviews', 'PillarTarget').objects.using(self.alias).count(), 0)
        self.assertNotIn('pillar_target', [field.name for field in final.get_model('organisation', 'GrowthEntry')._meta.fields])
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

    def test_growth_unlink_preserves_records_and_sealed_history(self):
        company = self.rows('companies', 'Company').create(name='Unlink', slug='unlink')
        head = self.person(company, 'head', True)
        employee = self.person(company, 'employee')
        second = self.person(company, 'second')
        targets = [('organisation', '0006_growthentry_pillar_target'), ('reviews', '0006_review_pillar_context_reviewcycle_started_at_and_more')]
        executor = MigrationExecutor(self.connection)
        executor.migrate(targets)
        apps = executor.loader.project_state(targets).apps
        def rows(app, model):
            return apps.get_model(app, model).objects.using(self.alias)
        cycle = rows('reviews', 'ReviewCycle').create(company_id=company.id, year=2027, kind='MID_YEAR', starts_on=date(2027,1,1), ends_on=date(2027,6,30), due_on=date(2027,7,1))
        target = rows('reviews', 'PillarTarget').create(company_id=company.id, cycle=cycle, employee_id=employee.id, created_by_id=head.membership_id, pillar='CONTEXT', target='Original target', success_measure='Success')
        growth = rows('organisation', 'GrowthEntry').create(company_id=company.id, owner_id=employee.membership_id, subject_id=employee.id, pillar_target=target, kind='CONTRIBUTION', category='Other contribution', title='Preserved', details='Original Growth content', shared=True)
        context = [{'id': str(target.id), 'pillar': 'CONTEXT', 'target': 'Original target', 'success_measure': 'Success', 'notes': '', 'evidence': [{'id': str(growth.id), 'details': 'Historical source', 'validation': 'PENDING'}]}]
        active = rows('reviews', 'Review').create(company_id=company.id, cycle=cycle, employee_id=employee.id, manager_id=head.id, reviewer_id=head.membership_id, pillar_context=context)
        final = rows('reviews', 'Review').create(company_id=company.id, cycle=cycle, employee_id=second.id, manager_id=head.id, reviewer_id=head.membership_id, state='FINALISED', pillar_context=context)
        snapshot = rows('reviews', 'FinalSnapshot').create(company_id=company.id, review=final, content={'pillar_context': context}, sha256='b'*64)
        before = rows('organisation', 'GrowthEntry').values().get(pk=growth.id)
        before.pop('pillar_target_id')
        latest = self.migrate()
        def migrated(app, model):
            return latest.get_model(app, model).objects.using(self.alias)
        self.assertEqual(migrated('organisation', 'GrowthEntry').values().get(pk=growth.id), before)
        self.assertNotIn('evidence', migrated('reviews', 'Review').get(pk=active.id).pillar_context[0])
        self.assertEqual(migrated('reviews', 'Review').get(pk=final.id).pillar_context, context)
        self.assertEqual(migrated('reviews', 'FinalSnapshot').get(pk=snapshot.id).content, {'pillar_context': context})
        self.assertEqual(migrated('reviews', 'FinalSnapshot').get(pk=snapshot.id).sha256, 'b'*64)
        self.assertTrue(migrated('reviews', 'ReviewEvent').filter(review_id=active.id, action='growth_evidence.archived').exists())
        self.assertEqual(migrated('reviews', 'PillarTarget').get(pk=target.id).target, 'Original target')

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
