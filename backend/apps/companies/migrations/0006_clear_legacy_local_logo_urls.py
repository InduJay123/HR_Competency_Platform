from urllib.parse import urlsplit

from django.db import migrations


def clear_legacy_urls(apps, schema_editor):
    Company = apps.get_model("companies", "Company")
    for company in Company.objects.using(schema_editor.connection.alias).exclude(logo_url="").iterator():
        try:
            url = urlsplit(company.logo_url)
        except ValueError:
            continue
        if (
            (company.logo_storage_path or company.logo_data)
            and url.scheme in ("http", "https")
            and url.hostname in ("localhost", "127.0.0.1", "::1")
            and url.path == f"/api/v1/company-logo/{company.id}/"
            and not url.query
            and not url.fragment
        ):
            Company.objects.using(schema_editor.connection.alias).filter(pk=company.pk).update(logo_url="")


class Migration(migrations.Migration):
    dependencies = [("companies", "0005_company_logo_storage_path")]
    operations = [migrations.RunPython(clear_legacy_urls, migrations.RunPython.noop)]
