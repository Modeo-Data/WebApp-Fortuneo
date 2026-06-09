# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  ORCHESTRATION — EN ATTENTE DES VRAIES DONNÉES ODI                         ║
# ║  Pour activer : décommenter ce fichier + settings.py + urls.py             ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

# from django.db import models
#
#
# class OrchestraNode(models.Model):
#     """A node in an orchestration graph (ODI scenario, shell script, DC capture…)."""
#     node_id = models.CharField(max_length=500, unique=True, db_index=True)
#     label   = models.CharField(max_length=500)
#     type    = models.CharField(max_length=100)   # odi_scenario | shell_script | dc_capture | …
#     group   = models.CharField(max_length=200, null=True, blank=True)  # logical section (MERLIN, OGC…)
#
#     class Meta:
#         ordering = ['group', 'label']
#
#
# class OrchestraEdge(models.Model):
#     """Directed dependency between two orchestration nodes."""
#     source_id = models.CharField(max_length=500, db_index=True)
#     target_id = models.CharField(max_length=500, db_index=True)
#     action    = models.CharField(max_length=50, null=True, blank=True)  # triggers | …
#
#     class Meta:
#         unique_together = ('source_id', 'target_id', 'action')
