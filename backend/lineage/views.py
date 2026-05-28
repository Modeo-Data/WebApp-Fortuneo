import os
import uuid
from datetime import datetime, timezone
from django.core.cache import cache
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework import status

from .parsers import parse_excel, merge_graphs

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
    return f"session:{session_id}"


def _get_session_id(request) -> str:
    sid = request.headers.get('X-Session-ID', '').strip()
    try:
        uuid.UUID(sid)
        return sid
    except ValueError:
        return str(uuid.uuid4())


def _save_session(session_id: str, payload: dict):
    try:
        cache.set(_cache_key(session_id), payload, timeout=SESSION_TTL)
    except Exception:
        pass


def _load_session(session_id: str) -> dict | None:
    try:
        return cache.get(_cache_key(session_id))
    except Exception:
        return None


def _load_sessions_index() -> list:
    try:
        data = cache.get(SESSIONS_INDEX_KEY)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _register_session(session_id: str, name: str, node_count: int, edge_count: int, mode: str):
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
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        files = request.FILES.getlist('file') or request.FILES.getlist('files')
        if not files:
            return Response(
                {'error': "Aucun fichier fourni. Envoyez un ou plusieurs fichiers Excel."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        bad = [f.name for f in files if not f.name.endswith(('.xlsx', '.xls'))]
        if bad:
            return Response(
                {'error': f"Format non supporté : {', '.join(bad)}. Utilisez .xlsx ou .xls."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        mode = request.data.get('mode', 'formula')
        if mode not in ('formula', 'structured'):
            mode = 'formula'

        graphs = []
        warnings = []
        for f in files:
            g = parse_excel(f, mode=mode)
            if '_error' in g:
                return Response({'error': f"{f.name} : {g['_error']}"}, status=400)
            if '_warning' in g:
                warnings.append(f"{f.name} : {g['_warning']}")
            graphs.append(g)

        merged = merge_graphs(*graphs) if len(graphs) > 1 else graphs[0]

        payload = {
            'nodes': merged['nodes'],
            'edges': merged['edges'],
            'mode': mode,
            'file_count': len(files),
        }
        if warnings:
            payload['warnings'] = warnings

        session_id = _get_session_id(request)
        _save_session(session_id, payload)

        graph_name = request.data.get('name', '').strip()
        if not graph_name:
            graph_name = ', '.join(f.name for f in files)
        _register_session(session_id, graph_name, len(merged['nodes']), len(merged['edges']), mode)

        payload['session_id'] = session_id
        return Response(payload, headers={'X-Session-ID': session_id})


class SessionView(APIView):
    def get(self, request):
        session_id = _get_session_id(request)
        payload = _load_session(session_id)
        if payload is None:
            return Response({'detail': 'Aucune session trouvée.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(payload)


class GraphListView(APIView):
    """GET /api/graphs/ — returns the index of all saved sessions."""
    def get(self, request):
        return Response(_load_sessions_index())


class ExplainView(APIView):
    """
    POST /api/explain/
    Body JSON : { "node_id": "...", "session_id": "..." }

    Reconstruit le sous-graphe d'ancêtres du nœud depuis la session Redis,
    le formate en prompt structuré, et appelle Claude pour l'expliquer.
    """
    parser_classes = [JSONParser]

    def post(self, request):
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
