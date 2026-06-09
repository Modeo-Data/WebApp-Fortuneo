# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  ORCHESTRATION — EN ATTENTE DES VRAIES DONNÉES ODI                         ║
# ║  Pour activer : décommenter ce fichier + settings.py + urls.py             ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

# import uuid
# from django.core.cache import cache
# from django.db import transaction
# from rest_framework.views import APIView
# from rest_framework.response import Response
# from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
# from rest_framework import status
#
# from .models import OrchestraNode, OrchestraEdge
# from .parser import OrchestraParser
#
# SESSION_TTL = 60 * 60 * 24  # 24 h
#
#
# def _save_session(session_id: str, payload: dict) -> None:
#     try:
#         cache.set(f"session:{session_id}", payload, timeout=SESSION_TTL)
#     except Exception:
#         pass
#
#
# class OrchestraImportView(APIView):
#     """POST /api/orchestra/import/ — parse a two-sheet Excel and upsert into orchestration catalog."""
#
#     parser_classes = [MultiPartParser, FormParser]
#
#     def post(self, request):
#         files = request.FILES.getlist('file') or request.FILES.getlist('files')
#         if not files:
#             return Response({'error': 'Aucun fichier fourni.'}, status=status.HTTP_400_BAD_REQUEST)
#
#         all_nodes, all_edges, all_warnings = [], [], []
#
#         for f in files:
#             if not f.name.endswith(('.xlsx', '.xls')):
#                 return Response(
#                     {'error': f"{f.name} : format non supporté. Utilisez .xlsx ou .xls."},
#                     status=status.HTTP_400_BAD_REQUEST,
#                 )
#             result = OrchestraParser(f).parse()
#             if result.error:
#                 return Response({'error': f"{f.name} : {result.error}"}, status=status.HTTP_400_BAD_REQUEST)
#             all_warnings.extend(result.warnings)
#             all_nodes.extend(result.nodes)
#             all_edges.extend(result.edges)
#
#         with transaction.atomic():
#             incoming_ids = [n.node_id for n in all_nodes]
#             existing_objs = {
#                 n.node_id: n
#                 for n in OrchestraNode.objects.filter(node_id__in=incoming_ids)
#             }
#             existing_ids = set(existing_objs)
#
#             to_create, to_update = [], []
#             for n in all_nodes:
#                 if n.node_id in existing_ids:
#                     obj = existing_objs[n.node_id]
#                     obj.label, obj.type, obj.group = n.label, n.type, n.group
#                     to_update.append(obj)
#                 else:
#                     to_create.append(OrchestraNode(
#                         node_id=n.node_id, label=n.label, type=n.type, group=n.group,
#                     ))
#
#             OrchestraNode.objects.bulk_create(to_create)
#             if to_update:
#                 OrchestraNode.objects.bulk_update(to_update, ['label', 'type', 'group'])
#
#             added_nodes   = len(to_create)
#             updated_nodes = len(to_update)
#
#             known_ids = existing_ids | {n.node_id for n in to_create}
#             edge_objs = [
#                 OrchestraEdge(source_id=e.source_id, target_id=e.target_id, action=e.action)
#                 for e in all_edges
#                 if e.source_id in known_ids and e.target_id in known_ids
#             ]
#             created_edges = OrchestraEdge.objects.bulk_create(edge_objs, ignore_conflicts=True)
#             added_edges = sum(1 for e in created_edges if e.pk is not None)
#
#         response = {
#             'added_nodes':   added_nodes,
#             'updated_nodes': updated_nodes,
#             'added_edges':   added_edges,
#             'total_nodes':   OrchestraNode.objects.count(),
#             'total_edges':   OrchestraEdge.objects.count(),
#         }
#         if all_warnings:
#             response['warnings'] = all_warnings
#         return Response(response)
#
#
# class OrchestraGraphView(APIView):
#     """POST /api/orchestra/graph/ — build a session from an orchestra node's full lineage."""
#
#     parser_classes = [JSONParser]
#
#     def post(self, request):
#         node_id = request.data.get('node_id', '').strip()
#         if not node_id:
#             return Response({'error': 'node_id requis.'}, status=status.HTTP_400_BAD_REQUEST)
#
#         try:
#             seed = OrchestraNode.objects.get(node_id=node_id)
#         except OrchestraNode.DoesNotExist:
#             return Response(
#                 {'error': f'Nœud "{node_id}" introuvable dans le catalogue orchestration.'},
#                 status=status.HTTP_404_NOT_FOUND,
#             )
#
#         all_edges_qs = OrchestraEdge.objects.values_list('source_id', 'target_id')
#         by_target: dict[str, list] = {}
#         by_source: dict[str, list] = {}
#         for src, tgt in all_edges_qs:
#             by_target.setdefault(tgt, []).append(src)
#             by_source.setdefault(src, []).append(tgt)
#
#         upstream: set[str] = set()
#         queue = [node_id]
#         while queue:
#             cur = queue.pop()
#             for src in by_target.get(cur, []):
#                 if src not in upstream:
#                     upstream.add(src)
#                     queue.append(src)
#
#         downstream: set[str] = set()
#         queue = [node_id]
#         while queue:
#             cur = queue.pop()
#             for tgt in by_source.get(cur, []):
#                 if tgt not in downstream:
#                     downstream.add(tgt)
#                     queue.append(tgt)
#
#         relevant_ids = upstream | downstream | {node_id}
#         orch_nodes = OrchestraNode.objects.filter(node_id__in=relevant_ids)
#         orch_edges = OrchestraEdge.objects.filter(
#             source_id__in=relevant_ids, target_id__in=relevant_ids,
#         )
#
#         nodes = [
#             {'id': n.node_id, 'label': n.label, 'type': n.type, 'group': n.group}
#             for n in orch_nodes
#         ]
#         edges = [
#             {'source': e.source_id, 'target': e.target_id, 'action': e.action}
#             for e in orch_edges
#         ]
#
#         session_id = str(uuid.uuid4())
#         _save_session(session_id, {
#             'nodes': nodes, 'edges': edges,
#             'mode': 'orchestration', 'seed_node_id': node_id,
#         })
#
#         return Response({'session_id': session_id, 'node_count': len(nodes), 'edge_count': len(edges)})
#
#
# class OrchestraNodesView(APIView):
#     """GET /api/orchestra/nodes/?q=<query>&type=<type>&group=<group> — browse the orchestration catalog."""
#
#     def get(self, request):
#         q     = request.query_params.get('q', '').strip().lower()
#         typ   = request.query_params.get('type', '').strip()
#         group = request.query_params.get('group', '').strip()
#
#         qs = OrchestraNode.objects.all()
#         if typ:
#             qs = qs.filter(type=typ)
#         if group:
#             qs = qs.filter(group=group)
#         if q:
#             qs = qs.filter(label__icontains=q)
#
#         nodes = list(qs.values('node_id', 'label', 'type', 'group')[:200])
#         return Response({
#             'nodes': nodes,
#             'total': OrchestraNode.objects.count(),
#         })
#
#
# class OrchestraClearView(APIView):
#     """DELETE /api/orchestra/clear/ — wipe the orchestration catalog."""
#
#     def delete(self, request):
#         OrchestraEdge.objects.all().delete()
#         OrchestraNode.objects.all().delete()
#         return Response({'status': 'cleared'})
