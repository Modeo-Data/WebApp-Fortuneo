import hashlib
import uuid
import json as json_lib
from datetime import datetime, timezone
from django.core.cache import cache
from django.conf import settings
from django.db import transaction
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework import status

from .models import SavedGraph, CatalogNode, CatalogEdge
from .catalog_parser import GraphParser

SESSION_TTL        = 60 * 60 * 24       # 24 h
SESSIONS_INDEX_KEY = "sessions_index"
SESSIONS_INDEX_TTL = 60 * 60 * 24 * 30  # 30 days


# ---------------------------------------------------------------------------
# Lineage helpers
# ---------------------------------------------------------------------------

def _build_ancestor_subgraph(node_id: str, nodes: list, edges: list) -> dict:
    """
    Remonte le graphe depuis node_id et retourne le sous-graphe
    de tous ses ancêtres (upstream complet).
    """
    node_map = {n['id']: n for n in nodes}

    ancestors = set()
    queue = [node_id]
    while queue:
        current = queue.pop()
        for e in edges:
            if e['target'] == current and e['source'] not in ancestors:
                ancestors.add(e['source'])
                queue.append(e['source'])

    relevant_ids = ancestors | {node_id}
    sub_nodes = [node_map[nid] for nid in relevant_ids if nid in node_map]
    sub_edges = [e for e in edges if e['source'] in relevant_ids and e['target'] in relevant_ids]

    return {'nodes': sub_nodes, 'edges': sub_edges}


def _format_lineage_for_prompt(node_id: str, subgraph: dict) -> str:
    """Formate le sous-graphe en texte structuré pour le prompt Claude."""
    node_map = {n['id']: n for n in subgraph['nodes']}
    lines = []

    # Lister les dépendances de chaque nœud
    deps: dict[str, list] = {n['id']: [] for n in subgraph['nodes']}
    for e in subgraph['edges']:
        if e['target'] in deps:
            deps[e['target']].append(e['source'])

    # Trier : sources d'abord, KPI en dernier
    order = {'source': 0, 'transformation': 1, 'use_case': 2}
    sorted_nodes = sorted(subgraph['nodes'], key=lambda n: order.get(n['type'], 1))

    for n in sorted_nodes:
        dep_labels = [f'"{node_map[d]["label"]}"' for d in deps[n['id']] if d in node_map]
        if dep_labels:
            lines.append(f'- "{n["label"]}" ({n["type"]}) ← dépend de : {", ".join(dep_labels)}')
        else:
            lines.append(f'- "{n["label"]}" ({n["type"]}) ← donnée source (pas de dépendance)')

    return '\n'.join(lines)


def _call_claude(node: dict, lineage_text: str) -> str:
    """
    Appelle Claude API avec le sous-graphe de dépendances.
    Fallback sur une description structurée si la clé est absente.
    """
    api_key = getattr(settings, 'ANTHROPIC_API_KEY', 'mock')

    if api_key == 'mock' or not api_key:
        # Fallback structuré sans IA
        return (
            f"[Mode démo — clé Claude API non configurée]\n\n"
            f"Voici le chemin de dépendances pour « {node['label']} » :\n\n"
            f"{lineage_text}"
        )

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key, timeout=30.0)

        prompt = f"""Tu es un expert en data lineage et reporting financier.

On te donne le graphe de dépendances d'un indicateur. Explique en 3-4 phrases claires comment "{node['label']}" est calculé, en décrivant le chemin depuis les données sources jusqu'au résultat final. Cite les nœuds par leur nom exact. Sois factuel et concis, ne suppose rien au-delà de ce qui est fourni.

Graphe de dépendances :
{lineage_text}

Réponds directement en français, sans introduction ni titre."""

        message = client.messages.create(
            model='claude-sonnet-4-20250514',
            max_tokens=400,
            messages=[{'role': 'user', 'content': prompt}],
        )
        return message.content[0].text

    except Exception as e:
        return f"Erreur lors de l'appel Claude API : {e}"


# ---------------------------------------------------------------------------
# Session helpers
# ---------------------------------------------------------------------------

def _cache_key(session_id: str) -> str:
    """Return the Redis/cache key for a session payload."""
    return f"session:{session_id}"


def _get_session_id(request: object) -> str:
    """Extract or generate a session UUID from the ``X-Session-ID`` request header.

    Args:
        request: DRF ``Request`` object.

    Returns:
        The validated UUID string from the header, or a freshly generated one.
    """
    sid = request.headers.get('X-Session-ID', '').strip()
    try:
        uuid.UUID(sid)
        return sid
    except ValueError:
        return str(uuid.uuid4())


def _save_session(session_id: str, payload: dict) -> None:
    """Persist a session payload to the cache with a 24-hour TTL.

    Args:
        session_id: UUID string identifying the session.
        payload: Graph data dict (``nodes``, ``edges``, ``mode``, …).
    """
    try:
        cache.set(_cache_key(session_id), payload, timeout=SESSION_TTL)
    except Exception:
        pass


def _load_session(session_id: str) -> dict | None:
    """Load a session payload from the cache.

    Args:
        session_id: UUID string identifying the session.

    Returns:
        The session dict, or ``None`` if the key is missing or the cache errors.
    """
    try:
        return cache.get(_cache_key(session_id))
    except Exception:
        return None


def _load_sessions_index() -> list:
    """Load the global sessions index from the cache.

    Returns:
        List of session metadata dicts, newest first.  Empty list on miss or error.
    """
    try:
        data = cache.get(SESSIONS_INDEX_KEY)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _register_session(session_id: str, name: str, node_count: int, edge_count: int, mode: str) -> None:
    """Insert or update a session entry in the global index (capped at 50 entries).

    Args:
        session_id: UUID string identifying the session.
        name: Human-readable graph name (filename or user-supplied).
        node_count: Number of nodes in the graph.
        edge_count: Number of edges in the graph.
        mode: Parsing mode used — ``'formula'``, ``'structured'``, or ``'json'``.
    """
    index = _load_sessions_index()
    index = [e for e in index if e.get('session_id') != session_id]
    index.insert(0, {
        'session_id': session_id,
        'name': name,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'node_count': node_count,
        'edge_count': edge_count,
        'mode': mode,
    })
    try:
        cache.set(SESSIONS_INDEX_KEY, index[:50], timeout=SESSIONS_INDEX_TTL)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Views
# ---------------------------------------------------------------------------

class UploadView(APIView):
    """POST /api/upload/ — parse Excel or JSON files and store the result in cache."""

    parser_classes = [MultiPartParser, FormParser]

    def post(self, request: object) -> object:
        files = request.FILES.getlist('file') or request.FILES.getlist('files')
        if not files:
            return Response({'error': 'Aucun fichier fourni.'}, status=status.HTTP_400_BAD_REQUEST)

        json_files  = [f for f in files if f.name.endswith('.json')]
        excel_files = [f for f in files if f.name.endswith(('.xlsx', '.xls'))]
        bad = [f.name for f in files if f not in json_files and f not in excel_files]

        if bad:
            return Response(
                {'error': f"Format non supporté : {', '.join(bad)}. Utilisez .xlsx, .xls ou .json."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if json_files and excel_files:
            return Response({'error': 'Ne mélangez pas JSON et Excel.'}, status=status.HTTP_400_BAD_REQUEST)

        nodes, edges, warnings = [], [], []

        if json_files:
            for f in json_files:
                try:
                    data = json_lib.loads(f.read().decode('utf-8'))
                    nodes.extend(data.get('nodes', []))
                    edges.extend(data.get('edges', []))
                except Exception:
                    return Response({'error': f"{f.name} : JSON invalide."}, status=status.HTTP_400_BAD_REQUEST)
        else:
            for f in excel_files:
                result = GraphParser(f).parse()
                if result.error:
                    return Response({'error': f"{f.name} : {result.error}"}, status=status.HTTP_400_BAD_REQUEST)
                warnings.extend(result.warnings)
                nodes.extend({'id': n.node_id, 'label': n.label, 'type': n.node_type} for n in result.nodes)
                edges.extend({'source': e.source_id, 'target': e.target_id, 'action': e.action} for e in result.edges)

        session_id   = _get_session_id(request)
        session_data = {'nodes': nodes, 'edges': edges, 'mode': 'catalog'}
        if warnings:
            session_data['warnings'] = warnings
        _save_session(session_id, session_data)

        graph_name = request.data.get('name', '').strip() or ', '.join(f.name for f in files)
        _register_session(session_id, graph_name, len(nodes), len(edges), 'catalog')

        return Response({'session_id': session_id}, headers={'X-Session-ID': session_id})


class SessionView(APIView):
    """GET /api/session/ — retrieve the graph data for the current session."""

    def get(self, request: object) -> object:
        session_id = _get_session_id(request)
        payload = _load_session(session_id)
        if payload is None:
            # Fall back to SQLite for saved graphs whose Redis entry expired
            try:
                saved = SavedGraph.objects.get(session_id=session_id)
                payload = saved.graph_data
                _save_session(session_id, payload)  # repopulate Redis
            except SavedGraph.DoesNotExist:
                return Response({'detail': 'Aucune session trouvée.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(payload)


class GraphListView(APIView):
    """GET /api/graphs/ — returns saved (SQLite) and cached (Redis) graph lists."""

    def get(self, request: object) -> object:
        try:
            saved_qs = SavedGraph.objects.values('session_id', 'name', 'created_at', 'node_count', 'edge_count', 'mode')
            saved = [
                {'session_id': r['session_id'], 'name': r['name'], 'timestamp': r['created_at'].isoformat(),
                 'node_count': r['node_count'], 'edge_count': r['edge_count'], 'mode': r['mode']}
                for r in (dict(row) for row in saved_qs)
            ]
            saved_ids = {s['session_id'] for s in saved}
        except Exception:
            saved, saved_ids = [], set()
        cached = [e for e in _load_sessions_index() if e['session_id'] not in saved_ids]
        return Response({'saved': saved, 'cached': cached})


class SaveView(APIView):
    """POST /api/graphs/<session_id>/save/ — persist a graph to SQLite.
    DELETE /api/graphs/<session_id>/save/ — remove it."""

    def post(self, request: object, session_id: str) -> object:
        payload = _load_session(session_id)
        if payload is None:
            # Fall back to SQLite for graphs whose Redis entry expired
            try:
                existing = SavedGraph.objects.get(session_id=session_id)
                payload = existing.graph_data
                _save_session(session_id, payload)
            except SavedGraph.DoesNotExist:
                return Response({'error': 'Session introuvable ou expirée.'}, status=status.HTTP_404_NOT_FOUND)
        index = _load_sessions_index()
        meta = next((e for e in index if e['session_id'] == session_id), {})
        SavedGraph.objects.update_or_create(
            session_id=session_id,
            defaults={
                'name':       meta.get('name', session_id),
                'node_count': meta.get('node_count', len(payload.get('nodes', []))),
                'edge_count': meta.get('edge_count', len(payload.get('edges', []))),
                'mode':       meta.get('mode', payload.get('mode', 'formula')),
                'graph_data': payload,
            },
        )
        return Response({'status': 'saved'})

    def delete(self, request: object, session_id: str) -> object:
        SavedGraph.objects.filter(session_id=session_id).delete()
        return Response({'status': 'removed'})


class GlobalSearchView(APIView):
    """GET /api/search/?q=<query> — search nodes across all saved and cached graphs."""

    def get(self, request: object) -> object:
        q = request.query_params.get('q', '').strip().lower()
        if len(q) < 2:
            return Response([])

        results = []
        seen: set[tuple] = set()

        def _search_graph(session_id: str, graph_name: str, graph_data: dict) -> None:
            for node in graph_data.get('nodes', []):
                label = (node.get('label') or '').lower()
                sheet = (node.get('sheet') or '').lower()
                if q in label or q in sheet:
                    key = (session_id, node['id'])
                    if key not in seen:
                        seen.add(key)
                        results.append({
                            'node_id':    node['id'],
                            'label':      node.get('label', ''),
                            'type':       node.get('type', ''),
                            'sheet':      node.get('sheet', ''),
                            'session_id': session_id,
                            'graph_name': graph_name,
                        })

        # Saved graphs (SQLite — always available)
        saved_ids: set[str] = set()
        try:
            for sg in SavedGraph.objects.all():
                saved_ids.add(sg.session_id)
                _search_graph(sg.session_id, sg.name, sg.graph_data)
        except Exception:
            pass

        # Cached-only graphs (Redis)
        for entry in _load_sessions_index():
            sid = entry['session_id']
            if sid in saved_ids:
                continue
            payload = _load_session(sid)
            if payload:
                _search_graph(sid, entry.get('name', sid), payload)
            if len(results) >= 200:
                break

        results.sort(key=lambda r: (0 if r['label'].lower().startswith(q) else 1, r['label'].lower()))
        return Response(results[:60])


class CatalogImportView(APIView):
    """POST /api/catalog/import/ — parse files and upsert every node/edge into the catalog."""

    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        files = request.FILES.getlist('file') or request.FILES.getlist('files')
        if not files:
            return Response({'error': 'Aucun fichier fourni.'}, status=status.HTTP_400_BAD_REQUEST)

        json_files  = [f for f in files if f.name.endswith('.json')]
        excel_files = [f for f in files if f.name.endswith(('.xlsx', '.xls'))]
        bad = [f.name for f in files if f not in json_files and f not in excel_files]
        if bad:
            return Response(
                {'error': f"Format non supporté : {', '.join(bad)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if json_files and excel_files:
            return Response(
                {'error': 'Ne mélangez pas JSON et Excel.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        all_nodes, all_edges, all_warnings = [], [], []

        if json_files:
            for f in json_files:
                try:
                    data = json_lib.loads(f.read().decode('utf-8'))
                except Exception:
                    return Response({'error': f"{f.name} : JSON invalide."}, status=status.HTTP_400_BAD_REQUEST)
                all_nodes.extend([
                    {'id': n['id'], 'label': n.get('label', ''), 'type': n.get('type', 'unknown'),
                     'stage': n.get('stage'), 'sheet': n.get('sheet')}
                    for n in data.get('nodes', [])
                ])
                all_edges.extend([
                    {'source': e['source'], 'target': e['target'], 'action': e.get('action')}
                    for e in data.get('edges', [])
                ])
        else:
            from .catalog_parser import GraphParser
            for f in excel_files:
                parser = GraphParser(f)
                result = parser.parse()
                if result.error:
                    return Response({'error': f"{f.name} : {result.error}"}, status=status.HTTP_400_BAD_REQUEST)
                all_warnings.extend(result.warnings)
                all_nodes.extend([
                    {'id': n.node_id, 'label': n.label, 'type': n.node_type,
                     'metadata': n.metadata, 'stage': None, 'sheet': None}
                    for n in result.nodes
                ])
                all_edges.extend([
                    {'source': e.source_id, 'target': e.target_id, 'action': e.action}
                    for e in result.edges
                ])

        with transaction.atomic():
            incoming_ids = [n['id'] for n in all_nodes]
            existing_objs = {
                n.node_id: n
                for n in CatalogNode.objects.filter(node_id__in=incoming_ids)
            }
            existing_ids = set(existing_objs)

            to_create, to_update = [], []
            for n in all_nodes:
                label = n.get('label') or n['id']
                typ   = n.get('type', 'unknown')
                stage = n.get('stage') or None
                sheet = n.get('sheet') or None
                if n['id'] in existing_ids:
                    obj = existing_objs[n['id']]
                    obj.label, obj.type, obj.stage, obj.sheet, obj.metadata = label, typ, stage, sheet, n.get('metadata') or {}
                    to_update.append(obj)
                else:
                    to_create.append(CatalogNode(node_id=n['id'], label=label, type=typ, stage=stage, sheet=sheet, metadata=n.get('metadata') or {}))

            CatalogNode.objects.bulk_create(to_create)
            if to_update:
                CatalogNode.objects.bulk_update(to_update, ['label', 'type', 'stage', 'sheet', 'metadata'])

            added_nodes   = len(to_create)
            updated_nodes = len(to_update)

            known_ids = existing_ids | {n.node_id for n in to_create}
            edge_objs = [
                CatalogEdge(source_id=e['source'], target_id=e['target'], action=e.get('action'))
                for e in all_edges
                if e['source'] in known_ids and e['target'] in known_ids
            ]
            created_edges = CatalogEdge.objects.bulk_create(edge_objs, ignore_conflicts=True)
            added_edges = sum(1 for e in created_edges if e.pk is not None)

        response = {
            'added_nodes':   added_nodes,
            'updated_nodes': updated_nodes,
            'added_edges':   added_edges,
            'total_nodes':   CatalogNode.objects.count(),
            'total_edges':   CatalogEdge.objects.count(),
        }
        if all_warnings:
            response['warnings'] = all_warnings
        return Response(response)


class CatalogNodesView(APIView):
    """GET /api/catalog/nodes/?q=<query>&type=<type> — browse the catalog."""

    def get(self, request):
        q    = request.query_params.get('q', '').strip().lower()
        typ  = request.query_params.get('type', '').strip()
        qs   = CatalogNode.objects.all()
        if typ:
            qs = qs.filter(type=typ)
        if q:
            qs = qs.filter(label__icontains=q)
        nodes = list(qs.values('node_id', 'label', 'type', 'stage', 'sheet', 'metadata')[:200])
        total = CatalogNode.objects.count()
        return Response({'nodes': nodes, 'total': total})


class CatalogGraphView(APIView):
    """POST /api/catalog/graph/ — build a session from a catalog node's full lineage."""

    parser_classes = [JSONParser]

    def post(self, request):
        node_id = request.data.get('node_id', '').strip()

        # No node_id → return the full catalog as a session
        if not node_id:
            catalog_nodes = CatalogNode.objects.all()
            catalog_edges = CatalogEdge.objects.all()
            nodes = [
                {'id': n.node_id, 'label': n.label, 'type': n.type,
                 'stage': n.stage, 'sheet': n.sheet, 'metadata': n.metadata}
                for n in catalog_nodes
            ]
            edges = [
                {'source': e.source_id, 'target': e.target_id, 'action': e.action}
                for e in catalog_edges
            ]
            session_id = str(uuid.uuid4())
            payload = {'nodes': nodes, 'edges': edges, 'mode': 'catalog'}
            _save_session(session_id, payload)
            _register_session(session_id, 'Catalogue complet', len(nodes), len(edges), 'catalog')
            return Response({'session_id': session_id, 'node_count': len(nodes), 'edge_count': len(edges)})

        try:
            seed = CatalogNode.objects.get(node_id=node_id)
        except CatalogNode.DoesNotExist:
            return Response({'error': f'Nœud "{node_id}" introuvable dans le catalogue.'}, status=status.HTTP_404_NOT_FOUND)

        # Load all edges once, build adjacency maps for BFS
        all_edges_qs = CatalogEdge.objects.values_list('source_id', 'target_id')
        by_target: dict[str, list] = {}
        by_source: dict[str, list] = {}
        for src, tgt in all_edges_qs:
            by_target.setdefault(tgt, []).append(src)
            by_source.setdefault(src, []).append(tgt)

        # BFS upstream (ancestors)
        upstream: set[str] = set()
        queue = [node_id]
        while queue:
            cur = queue.pop()
            for src in by_target.get(cur, []):
                if src not in upstream:
                    upstream.add(src)
                    queue.append(src)

        # BFS downstream (descendants)
        downstream: set[str] = set()
        queue = [node_id]
        while queue:
            cur = queue.pop()
            for tgt in by_source.get(cur, []):
                if tgt not in downstream:
                    downstream.add(tgt)
                    queue.append(tgt)

        relevant_ids = upstream | downstream | {node_id}
        catalog_nodes = CatalogNode.objects.filter(node_id__in=relevant_ids)
        catalog_edges = CatalogEdge.objects.filter(
            source_id__in=relevant_ids, target_id__in=relevant_ids
        )

        nodes = [
            {'id': n.node_id, 'label': n.label, 'type': n.type,
             'stage': n.stage, 'sheet': n.sheet, 'metadata': n.metadata}
            for n in catalog_nodes
        ]
        edges = [
            {'source': e.source_id, 'target': e.target_id, 'action': e.action}
            for e in catalog_edges
        ]

        session_id = str(uuid.uuid4())
        payload = {'nodes': nodes, 'edges': edges, 'mode': 'catalog', 'seed_node_id': node_id}
        _save_session(session_id, payload)
        _register_session(session_id, seed.label, len(nodes), len(edges), 'catalog')

        return Response({'session_id': session_id, 'node_count': len(nodes), 'edge_count': len(edges)})


class ClearAllView(APIView):
    """DELETE /api/clear/ — wipe catalog (SQLite) + all sessions (Redis)."""

    def delete(self, request):
        CatalogEdge.objects.all().delete()
        CatalogNode.objects.all().delete()
        try:
            cache.clear()
        except Exception:
            pass
        return Response({'status': 'cleared'})


class ExplainView(APIView):
    """
    POST /api/explain/
    Body JSON : { "node_id": "...", "session_id": "..." }

    Reconstruit le sous-graphe d'ancêtres du nœud depuis la session Redis,
    le formate en prompt structuré, et appelle Claude pour l'expliquer.
    """
    parser_classes = [JSONParser]

    def post(self, request: object) -> object:
        """Build the ancestor subgraph for a node and return a Claude-generated explanation.

        Args:
            request: DRF ``Request`` with JSON body ``{"node_id": "...", "session_id": "..."}``.
                     The session is resolved from the ``X-Session-ID`` header.

        Returns:
            ``200 OK`` with ``{"node_id", "explanation", "lineage_used"}``, or an error
            response (``400`` / ``404``) when the node or session cannot be found.
        """
        node_id = request.data.get('node_id', '').strip()
        if not node_id:
            return Response({'error': 'node_id requis.'}, status=status.HTTP_400_BAD_REQUEST)

        session_id = _get_session_id(request)
        session = _load_session(session_id)
        if not session:
            return Response(
                {'error': 'Session introuvable. Uploadez d\'abord un fichier.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        nodes = session.get('nodes', [])
        edges = session.get('edges', [])
        node_map = {n['id']: n for n in nodes}

        if node_id not in node_map:
            return Response({'error': f'Nœud "{node_id}" introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        node = node_map[node_id]
        subgraph = _build_ancestor_subgraph(node_id, nodes, edges)
        lineage_text = _format_lineage_for_prompt(node_id, subgraph)

        lineage_hash = hashlib.md5(lineage_text.encode()).hexdigest()
        explain_key = f"explain:{node_id}:{lineage_hash}"
        cached_explanation = cache.get(explain_key)
        if cached_explanation:
            return Response({'node_id': node_id, 'explanation': cached_explanation, 'lineage_used': lineage_text})

        explanation = _call_claude(node, lineage_text)
        try:
            cache.set(explain_key, explanation, timeout=60 * 60 * 24)
        except Exception:
            pass

        return Response({
            'node_id': node_id,
            'explanation': explanation,
            'lineage_used': lineage_text,
        })
