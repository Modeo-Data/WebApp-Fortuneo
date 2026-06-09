from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='OrchestraNode',
            fields=[
                ('id',      models.BigAutoField(auto_created=True, primary_key=True)),
                ('node_id', models.CharField(db_index=True, max_length=500, unique=True)),
                ('label',   models.CharField(max_length=500)),
                ('type',    models.CharField(max_length=100)),
                ('group',   models.CharField(blank=True, max_length=200, null=True)),
            ],
            options={'ordering': ['group', 'label']},
        ),
        migrations.CreateModel(
            name='OrchestraEdge',
            fields=[
                ('id',        models.BigAutoField(auto_created=True, primary_key=True)),
                ('source_id', models.CharField(db_index=True, max_length=500)),
                ('target_id', models.CharField(db_index=True, max_length=500)),
                ('action',    models.CharField(blank=True, max_length=50, null=True)),
            ],
            options={'unique_together': {('source_id', 'target_id', 'action')}},
        ),
    ]
