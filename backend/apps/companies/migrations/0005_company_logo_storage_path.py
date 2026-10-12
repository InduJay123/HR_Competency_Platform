from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("companies", "0004_alter_company_declared_employees")]

    operations = [
        migrations.AddField(
            model_name="company",
            name="logo_storage_path",
            field=models.CharField(blank=True, default="", editable=False, max_length=200),
        ),
    ]
