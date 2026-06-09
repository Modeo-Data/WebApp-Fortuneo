from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('lineage', '0003_catalogedge_action'),
    ]

    operations = [
        migrations.AddField(
            model_name='catalognode',
            name='metadata',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
