"""Django ORM models for the lineage catalog.

Three tables back the app:

* ``SavedGraph`` — promoted (persistent) sessions; one row per saved graph.
* ``CatalogNode`` — every node ever ingested across imports; the canonical registry.
* ``CatalogEdge`` — directed dependencies between catalog nodes.
"""

from django.db import models


class SavedGraph(models.Model):
    """A graph that was explicitly promoted from Redis to durable storage.

    Attributes:
        session_id (str): UUID matching the original Redis session.
        name (str): human-readable name (filename or user-supplied).
        created_at (datetime): set automatically on first save.
        node_count (int): cached count of nodes in ``graph_data``.
        edge_count (int): cached count of edges in ``graph_data``.
        mode (str): parsing mode that produced the payload.
        graph_data (dict): the full ``{'nodes': [...], 'edges': [...]}`` payload.
    """
    session_id = models.CharField(max_length=36, unique=True)
    name       = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)
    node_count = models.IntegerField()
    edge_count = models.IntegerField()
    mode       = models.CharField(max_length=20)
    graph_data = models.JSONField()

    class Meta:
        ordering = ['-created_at']


class CatalogNode(models.Model):
    """Persistent registry of every known node across all imported files.

    Attributes:
        node_id (str): unique business identifier; indexed for fast lookups.
        label (str): display label; indexed because the global search filters on it.
        type (str): node type from ``NodeTypeRegistry``; indexed for type filters.
        stage (str | None): optional pipeline stage label.
        sheet (str | None): optional source Excel sheet name.
        metadata (dict): format-specific extras (``job_type``, ``nom_sql``, paths, ...).
        updated_at (datetime): set automatically on every save; used for cache busting.
    """
    node_id    = models.CharField(max_length=500, unique=True, db_index=True)
    label      = models.CharField(max_length=500, db_index=True)
    type       = models.CharField(max_length=50,  db_index=True)
    stage      = models.CharField(max_length=50,  null=True, blank=True)
    sheet      = models.CharField(max_length=200, null=True, blank=True)
    metadata   = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['label']


class CatalogEdge(models.Model):
    """Directed dependency between two catalog nodes.

    Attributes:
        source_id (str): id of the source node.
        target_id (str): id of the target node.
        action (str | None): ``read`` / ``write`` / ``triggers`` / ``calls`` /
            None when the verb isn't known.
        created_at (datetime): set automatically on first insert.
    """
    source_id  = models.CharField(max_length=500, db_index=True)
    target_id  = models.CharField(max_length=500, db_index=True)
    action     = models.CharField(max_length=50, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, null=True)

    class Meta:
        unique_together = ('source_id', 'target_id', 'action')


class OdiNode(models.Model):
    """Persistent registry of ODI-side nodes — completely disjoint from CatalogNode.

    Scenarios (``type='odi_mapping'``) come straight from CSV imports.
    Warehouse references that an ODI scenario reads or writes are materialised
    here as shadow nodes (``type='datawarehouse'``, no upstream) so the ODI
    universe is fully self-contained.

    Attributes:
        node_id (str): unique business identifier; indexed.
        label (str): display label; indexed for search.
        type (str): node type from ``NodeTypeRegistry``; indexed for filters.
        stage (str | None): optional pipeline stage label.
        sheet (str | None): optional source file/sheet name.
        metadata (dict): format-specific extras (``Itable``, ``IsourceTab``, rows...).
        updated_at (datetime): set automatically on every save.
    """
    node_id    = models.CharField(max_length=500, unique=True, db_index=True)
    label      = models.CharField(max_length=500, db_index=True)
    type       = models.CharField(max_length=50,  db_index=True)
    stage      = models.CharField(max_length=50,  null=True, blank=True)
    sheet      = models.CharField(max_length=200, null=True, blank=True)
    metadata   = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['label']


class OdiEdge(models.Model):
    """Directed dependency on the ODI side — disjoint from CatalogEdge.

    Attributes:
        source_id (str): id of the source OdiNode.
        target_id (str): id of the target OdiNode.
        action (str | None): typically ``read`` or ``write``.
        created_at (datetime): set automatically on first insert.
    """
    source_id  = models.CharField(max_length=500, db_index=True)
    target_id  = models.CharField(max_length=500, db_index=True)
    action     = models.CharField(max_length=50, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, null=True)

    class Meta:
        unique_together = ('source_id', 'target_id', 'action')
