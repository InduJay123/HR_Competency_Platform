from django.db import migrations

def install(apps,schema_editor):
    if schema_editor.connection.vendor!='postgresql':
        return
    schema_editor.execute('''
    CREATE FUNCTION bfl_immutable_row() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'Immutable historical record'; END; $$ LANGUAGE plpgsql;
    CREATE TRIGGER snapshot_immutable BEFORE UPDATE OR DELETE ON reviews_finalsnapshot FOR EACH ROW EXECUTE FUNCTION bfl_immutable_row();
    CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_auditlog FOR EACH ROW EXECUTE FUNCTION bfl_immutable_row();
    CREATE FUNCTION bfl_sealed_submission() RETURNS trigger AS $$
    BEGIN IF OLD.submitted_at IS NOT NULL THEN RAISE EXCEPTION 'Submitted form is immutable'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
    CREATE TRIGGER submission_immutable BEFORE UPDATE OR DELETE ON reviews_submission FOR EACH ROW EXECUTE FUNCTION bfl_sealed_submission();
    CREATE FUNCTION bfl_final_review() RETURNS trigger AS $$
    BEGIN IF OLD.state = 'FINALISED' THEN RAISE EXCEPTION 'Final review is immutable'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
    CREATE TRIGGER review_immutable BEFORE UPDATE OR DELETE ON reviews_review FOR EACH ROW EXECUTE FUNCTION bfl_final_review();
    ''')

def uninstall(apps,schema_editor):
    if schema_editor.connection.vendor!='postgresql':
        return
    schema_editor.execute('''
    DROP TRIGGER IF EXISTS snapshot_immutable ON reviews_finalsnapshot;
    DROP TRIGGER IF EXISTS audit_immutable ON audit_auditlog;
    DROP TRIGGER IF EXISTS submission_immutable ON reviews_submission;
    DROP TRIGGER IF EXISTS review_immutable ON reviews_review;
    DROP FUNCTION IF EXISTS bfl_immutable_row();
    DROP FUNCTION IF EXISTS bfl_sealed_submission();
    DROP FUNCTION IF EXISTS bfl_final_review();
    ''')

class Migration(migrations.Migration):
    dependencies=[('reviews','0001_initial'),('audit','0001_initial')]
    operations=[migrations.RunPython(install,uninstall)]
