from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('lineage', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='CatalogNode',
            fields=[
                ('id',      models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('node_id', models.CharField(db_index=True, max_length=500, unique=True)),
                ('label',   models.CharField(max_length=500)),
                ('type',    models.CharField(max_length=50)),
                ('stage',   models.CharField(blank=True, max_length=50, null=True)),
                ('sheet',   models.CharField(blank=True, max_length=200, null=True)),
            ],
            options={'ordering': ['label']},
        ),
        migrations.CreateModel(
            name='CatalogEdge',
            fields=[
                ('id',        models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('source_id', models.CharField(db_index=True, max_length=500)),
                ('target_id', models.CharField(db_index=True, max_length=500)),
            ],
            options={'unique_together': {('source_id', 'target_id')}},
        ),
    ]
