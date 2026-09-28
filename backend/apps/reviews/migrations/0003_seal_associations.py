from django.db import migrations


def install(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    schema_editor.execute('''
    CREATE OR REPLACE FUNCTION bfl_sealed_submission() RETURNS trigger AS $$
    BEGIN
      IF OLD.submitted_at IS NOT NULL THEN RAISE EXCEPTION 'Submitted form is immutable'; END IF;
      IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
    END; $$ LANGUAGE plpgsql;
    CREATE OR REPLACE FUNCTION bfl_final_review() RETURNS trigger AS $$
    BEGIN
      IF OLD.state='FINALISED' THEN RAISE EXCEPTION 'Final review is immutable'; END IF;
      IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
    END; $$ LANGUAGE plpgsql;
    CREATE FUNCTION bfl_sealed_evidence_link() RETURNS trigger AS $$
    DECLARE sid uuid;
    BEGIN
      IF TG_OP='DELETE' THEN sid=OLD.submission_id; ELSE sid=NEW.submission_id; END IF;
      IF EXISTS(SELECT 1 FROM reviews_submission WHERE id=sid AND submitted_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Submitted evidence selection is immutable';
      END IF;
      IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
    END; $$ LANGUAGE plpgsql;
    CREATE TRIGGER submission_evidence_immutable BEFORE INSERT OR UPDATE OR DELETE ON reviews_submission_evidence FOR EACH ROW EXECUTE FUNCTION bfl_sealed_evidence_link();
    CREATE TRIGGER review_event_immutable BEFORE UPDATE OR DELETE ON reviews_reviewevent FOR EACH ROW EXECUTE FUNCTION bfl_immutable_row();
    ''')


def uninstall(apps, schema_editor):
    if schema_editor.connection.vendor == 'postgresql':
        schema_editor.execute('DROP TRIGGER submission_evidence_immutable ON reviews_submission_evidence; DROP FUNCTION bfl_sealed_evidence_link(); DROP TRIGGER review_event_immutable ON reviews_reviewevent;')


class Migration(migrations.Migration):
    dependencies=[('reviews','0002_immutability')]
    operations=[migrations.RunPython(install,uninstall)]
