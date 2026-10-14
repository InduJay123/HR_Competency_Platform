from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('companies', '0006_clear_legacy_local_logo_urls'),
        ('organisation', '0005_two_level_reporting'),
    ]
    operations = [
        migrations.AddConstraint(
            model_name='membership',
            constraint=models.UniqueConstraint(fields=['company'],
                condition=models.Q(active=True, is_head_hr=True), name='one_active_head_hr'),
        ),
        migrations.RemoveField(model_name='membership', name='is_manager'),
    ]
