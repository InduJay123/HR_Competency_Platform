from django.db import migrations
from django.db.models import F


def validate_and_normalize(apps, schema_editor):
    alias = schema_editor.connection.alias
    Company = apps.get_model('companies', 'Company')
    Membership = apps.get_model('companies', 'Membership')
    Profile = apps.get_model('organisation', 'EmployeeProfile')
    Relationship = apps.get_model('organisation', 'ReportingRelationship')
    Review = apps.get_model('reviews', 'Review')
    conflicts, heads = [], {}
    if schema_editor.connection.vendor == 'postgresql':
        with schema_editor.connection.cursor() as cursor:
            # DeleteModel uses CASCADE on PostgreSQL. Refuse unexpected external
            # dependencies rather than silently removing another feature's data.
            cursor.execute("""SELECT conrelid::regclass::text, conname FROM pg_constraint
                WHERE contype='f' AND confrelid='organisation_reportingrelationship'::regclass""")
            conflicts.extend(f'external reporting FK: {table}.{name}' for table, name in cursor.fetchall())
            cursor.execute("""SELECT DISTINCT c.relname FROM pg_depend d
                JOIN pg_rewrite r ON r.oid=d.objid AND d.classid='pg_rewrite'::regclass
                JOIN pg_class c ON c.oid=r.ev_class
                WHERE d.refobjid='organisation_reportingrelationship'::regclass AND c.relkind IN ('v','m')""")
            conflicts.extend(f'dependent reporting view: {row[0]}' for row in cursor.fetchall())
            cursor.execute("""SELECT DISTINCT c.relname FROM pg_depend d
                JOIN pg_rewrite r ON r.oid=d.objid AND d.classid='pg_rewrite'::regclass
                JOIN pg_class c ON c.oid=r.ev_class
                JOIN pg_attribute a ON a.attrelid=d.refobjid AND a.attnum=d.refobjsubid
                WHERE d.refobjid='companies_membership'::regclass AND a.attname='is_manager'
                AND c.relkind IN ('v','m')""")
            conflicts.extend(f'dependent manager-flag view: {row[0]}' for row in cursor.fetchall())
    # Lock the tenant rows before checking, and finish ALL checks before writes.
    for company in Company.objects.using(alias).select_for_update().all():
        members = list(Membership.objects.using(alias).filter(
            company_id=company.pk, active=True, is_head_hr=True))
        if len(members) != 1:
            conflicts.append(f'{company.pk}: {len(members)} active Heads of HR')
            continue
        profile = Profile.objects.using(alias).filter(
            membership_id=members[0].pk, company_id=company.pk,
            membership__user__is_superuser=False).first()
        if profile is None:
            conflicts.append(f'{company.pk}: Head of HR lacks an eligible same-company profile')
        else:
            heads[company.pk] = profile
            if Review.objects.using(alias).filter(employee_id=profile.pk).exclude(state='FINALISED').exists():
                conflicts.append(f'{company.pk}: Head of HR has an unfinished self-review; finish it before migration')
    if Profile.objects.using(alias).exclude(company_id=F('membership__company_id')).exists():
        conflicts.append('Employee profile/membership company mismatch')
    if conflicts:
        raise RuntimeError('Two-level migration blocked; no reporting data changed. '
                           'Run audit_reporting and set_head_hr with an explicitly approved membership ID. '
                           + '; '.join(conflicts))
    for company_id, head in heads.items():
        Relationship.objects.using(alias).filter(employee_id=head.pk).delete()
        for employee in Profile.objects.using(alias).filter(
                company_id=company_id, membership__active=True).exclude(pk=head.pk):
            Relationship.objects.using(alias).update_or_create(
                employee_id=employee.pk, defaults={'company_id': company_id, 'manager_id': head.pk})
    if schema_editor.connection.vendor == 'postgresql':
        # Django's FKs are deferred. Complete their checks before DeleteModel in
        # this same atomic transaction; PostgreSQL otherwise refuses the DROP
        # with "pending trigger events" after normalization writes.
        schema_editor.execute('SET CONSTRAINTS ALL IMMEDIATE')


class Migration(migrations.Migration):
    atomic = True
    dependencies = [
        ('organisation', '0004_growthentry'),
        ('companies', '0006_clear_legacy_local_logo_urls'),
        ('reviews', '0005_review_employee_comments'),
    ]
    operations = [
        # Deliberately irreversible: arbitrary legacy mappings cannot be recreated.
        migrations.RunPython(validate_and_normalize),
        migrations.DeleteModel(name='ReportingRelationship'),
    ]
