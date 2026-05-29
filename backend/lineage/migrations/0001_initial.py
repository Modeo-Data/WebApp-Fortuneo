from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True
    dependencies = []

    operations = [
        migrations.CreateModel(
            name='SavedGraph',
            fields=[
                ('id',         models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ('session_id', models.CharField(max_length=36, unique=True)),
                ('name',       models.CharField(max_length=200)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('node_count', models.IntegerField()),
                ('edge_count', models.IntegerField()),
                ('mode',       models.CharField(max_length=20)),
                ('graph_data', models.JSONField()),
            ],
            options={'ordering': ['-created_at']},
        ),
    ]
