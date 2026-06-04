from django.db import models


class SavedGraph(models.Model):
    session_id = models.CharField(max_length=36, unique=True)
    name       = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)
    node_count = models.IntegerField()
    edge_count = models.IntegerField()
    mode       = models.CharField(max_length=20)
    graph_data = models.JSONField()  # full nodes + edges, survives Redis TTL

    class Meta:
        ordering = ['-created_at']


class CatalogNode(models.Model):
    """Persistent registry of every known node across all imported files."""
    node_id = models.CharField(max_length=500, unique=True, db_index=True)
    label   = models.CharField(max_length=500)
    type    = models.CharField(max_length=50)   # feature | component | ingest | compute | virtual | extract | datalake | datawarehouse | ...
    stage   = models.CharField(max_length=50, null=True, blank=True)
    sheet   = models.CharField(max_length=200, null=True, blank=True)

    class Meta:
        ordering = ['label']


class CatalogEdge(models.Model):
    """Directed dependency: source_id → target_id, optionally labelled by action."""
    source_id = models.CharField(max_length=500, db_index=True)
    target_id = models.CharField(max_length=500, db_index=True)
    action    = models.CharField(max_length=50, null=True, blank=True)  # read | write | triggers

    class Meta:
        unique_together = ('source_id', 'target_id', 'action')
