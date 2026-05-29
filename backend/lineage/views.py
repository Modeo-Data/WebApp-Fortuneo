import os
import uuid
import json as json_lib
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timezone
from django.core.cache import cache
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework import status

from .parsers import parse_excel, merge_graphs
from .models import SavedGraph


@dataclass
class ParseResult:
    merged:   dict | None = None
    mode:     str         = 'json'
    warnings: list        = field(default_factory=list)
    error:    str | None  = None

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
    order = {'source': 0, 'transformation': 1, 'kpi': 2}
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
        client = anthropic.Anthropic(api_key=api_key)

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

def _parse_single_json_file(f: object) -> tuple[dict | None, str | None, str | None]:
    """Parse one JSON file into a graph dict.

    Args:
        f: Django uploaded file object.  Must decode to a JSON object with ``nodes``
           and ``edges`` list fields.

    Returns:
        ``(graph, mode, error)`` — on success ``error`` is ``None``; on failure
        ``graph`` and ``mode`` are ``None`` and ``error`` contains a message.
    """
    try:
        data = json_lib.loads(f.read().decode('utf-8'))
        if not isinstance(data, dict):
            raise ValueError(f"{f.name} : le JSON doit être un objet avec 'nodes' et 'edges'.")
        nodes, edges = data.get('nodes'), data.get('edges')
        if not isinstance(nodes, list) or not isinstance(edges, list):
            raise ValueError(f"{f.name} : le JSON doit contenir 'nodes' et 'edges'.")
        return {'nodes': nodes, 'edges': edges}, data.get('mode', 'json'), None
    except ValueError as e:
        return None, None, str(e)
    except Exception:
        return None, None, f"{f.name} : JSON invalide."


def _parse_single_excel_file(f: object, mode: str) -> tuple[dict | None, str | None, str | None]:
    """Parse one Excel file into a graph dict.

    Args:
        f: Django uploaded file object (``.xlsx`` / ``.xls``).
        mode: Parsing strategy — ``'formula'`` or ``'structured'``.

    Returns:
        ``(graph, warning, error)`` — ``warning`` and ``error`` are mutually exclusive
        strings; both are ``None`` on a clean success.
    """
    g = parse_excel(f, mode=mode)
    if '_error' in g:
        return None, None, f"{f.name} : {g['_error']}"
    warning = f"{f.name} : {g['_warning']}" if '_warning' in g else None
    return g, warning, None


def _parse_json_files(files: list) -> ParseResult:
    """Parse a list of JSON files in parallel and merge the resulting graphs.

    Args:
        files: List of Django uploaded file objects.

    Returns:
        :class:`ParseResult` with ``merged`` graph and ``mode`` set to the first
        file's declared mode, or ``error`` set on the first failure encountered.
    """
    graphs, mode = [None] * len(files), 'json'
    with ThreadPoolExecutor() as executor:
        futures = {executor.submit(_parse_single_json_file, f): i for i, f in enumerate(files)}
        for future in as_completed(futures):
            graph, file_mode, error = future.result()
            if error:
                return ParseResult(error=error)
            i = futures[future]
            if i == 0:
                mode = file_mode
            graphs[i] = graph
    merged = merge_graphs(*graphs) if len(graphs) > 1 else graphs[0]
    return ParseResult(merged=merged, mode=mode)


def _parse_excel_files(files: list, mode: str) -> ParseResult:
    """Parse a list of Excel files in parallel and merge the resulting graphs.

    Args:
        files: List of Django uploaded file objects (``.xlsx`` / ``.xls``).
        mode: Parsing strategy — ``'formula'`` or ``'structured'``.

    Returns:
        :class:`ParseResult` with ``merged`` graph and accumulated ``warnings``,
        or ``error`` set on the first failure encountered.
    """
    graphs, warnings = [None] * len(files), []
    with ThreadPoolExecutor() as executor:
        futures = {executor.submit(_parse_single_excel_file, f, mode): i for i, f in enumerate(files)}
        for future in as_completed(futures):
            graph, warning, error = future.result()
            if error:
                return ParseResult(error=error)
            i = futures[future]
            if warning:
                warnings.append(warning)
            graphs[i] = graph
    merged = merge_graphs(*graphs) if len(graphs) > 1 else graphs[0]
    return ParseResult(merged=merged, mode=mode, warnings=warnings)


class UploadView(APIView):
    """POST /api/upload/ — parse one or more Excel or JSON files and store the result in cache."""

    parser_classes = [MultiPartParser, FormParser]

    def post(self, request: object) -> object:
        """Accept uploaded files, parse them, and return the new session ID.

        Args:
            request: DRF ``Request`` with ``multipart/form-data`` body.  Expected fields:
                - ``file`` (one or more): the files to upload.
                - ``mode`` (str, optional): ``'formula'`` or ``'structured'`` for Excel files.
                - ``name`` (str, optional): human-readable graph name.

        Returns:
            ``200 OK`` with ``{"session_id": "<uuid>"}`` on success, or
            ``400 Bad Request`` with ``{"error": "..."}`` on failure.
        """
        files = request.FILES.getlist('file') or request.FILES.getlist('files')
        if not files:
            return Response({'error': "Aucun fichier fourni."}, status=status.HTTP_400_BAD_REQUEST)

        json_files  = [f for f in files if f.name.endswith('.json')]
        excel_files = [f for f in files if f.name.endswith(('.xlsx', '.xls'))]
        bad = [f.name for f in files if f not in json_files and f not in excel_files]

        if bad:
            return Response(
                {'error': f"Format non supporté : {', '.join(bad)}. Utilisez .xlsx, .xls ou .json."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if json_files and excel_files:
            return Response(
                {'error': "Ne mélangez pas les fichiers JSON et Excel."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        match 'json' if json_files else 'excel':
            case 'json':
                result = _parse_json_files(json_files)
            case 'excel':
                raw_mode = request.data.get('mode', 'formula')
                mode = raw_mode if raw_mode in ('formula', 'structured') else 'formula'
                result = _parse_excel_files(excel_files, mode)

        if result.error:
            return Response({'error': result.error}, status=status.HTTP_400_BAD_REQUEST)

        session_data = {
            'nodes':      result.merged['nodes'],
            'edges':      result.merged['edges'],
            'mode':       result.mode,
            'file_count': len(files),
            **(({'warnings': result.warnings}) if result.warnings else {}),
        }

        session_id = _get_session_id(request)
        _save_session(session_id, session_data)

        graph_name = request.data.get('name', '').strip() or ', '.join(f.name for f in files)
        _register_session(session_id, graph_name, len(result.merged['nodes']), len(result.merged['edges']), result.mode)

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
        explanation = _call_claude(node, lineage_text)

        return Response({
            'node_id': node_id,
            'explanation': explanation,
            'lineage_used': lineage_text,
        })
