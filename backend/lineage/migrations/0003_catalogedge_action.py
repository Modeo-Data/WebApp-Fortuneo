from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('lineage', '0002_catalog'),
    ]

    operations = [
        migrations.AddField(
            model_name='catalogedge',
            name='action',
            field=models.CharField(blank=True, max_length=50, null=True),
        ),
        migrations.AlterUniqueTogether(
            name='catalogedge',
            unique_together={('source_id', 'target_id', 'action')},
        ),
    ]
