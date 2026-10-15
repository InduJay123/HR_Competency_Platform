from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0001_initial")]
    operations = [
        migrations.AddField(
            model_name="user", name="profile_picture_storage_path",
            field=models.CharField(max_length=255, blank=True, default="", editable=False),
        ),
        migrations.AddField(
            model_name="user", name="profile_picture_version",
            field=models.PositiveIntegerField(default=0, editable=False),
        ),
    ]
