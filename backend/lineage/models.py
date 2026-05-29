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
