"""HTTP views for the lineage app — uploads, catalog management, insights, explanations.

Most endpoints follow the same shape: parse query params or files, defer to a
named helper for the heavy lifting, return a DRF Response. Helpers live above
the view classes; each one has a single named responsibility.
"""

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

from .models import SavedGraph, CatalogNode, CatalogEdge, OdiNode, OdiEdge
from .catalog_parser import GraphParser


SOURCE_DC:  str = 'dc'
SOURCE_ODI: str = 'odi'
VALID_SOURCES: set[str] = {SOURCE_DC, SOURCE_ODI}


def _select_source(request) -> str:
    """Resolve the ``?source=`` query param, defaulting to ``'dc'``.

    Args:
        request: DRF Request whose ``query_params`` may carry ``source``.

    Returns:
        str: ``'dc'`` or ``'odi'``. Unknown values fall back to ``'dc'``.
    """
    value = (request.query_params.get('source') or SOURCE_DC).lower()
    return value if value in VALID_SOURCES else SOURCE_DC


def _node_model(source: str):
    """Return the Django model that stores nodes for the given source.

    Args:
        source (str): ``'dc'`` or ``'odi'``.

    Returns:
        Model: ``CatalogNode`` for DC, ``OdiNode`` for ODI.
    """
    return OdiNode if source == SOURCE_ODI else CatalogNode


def _edge_model(source: str):
    """Return the Django model that stores edges for the given source.

    Args:
        source (str): ``'dc'`` or ``'odi'``.

    Returns:
        Model: ``CatalogEdge`` for DC, ``OdiEdge`` for ODI.
    """
    return OdiEdge if source == SOURCE_ODI else CatalogEdge


SESSION_TTL:                 int = 60 * 60 * 24
SESSIONS_INDEX_KEY:          str = "sessions_index"
SESSIONS_INDEX_TTL:          int = 60 * 60 * 24 * 30
SESSIONS_INDEX_MAX:          int = 50

UNKNOWN_TYPE:                str = 'unknown'

JSON_EXTS:                   tuple[str, ...] = ('.json',)
EXCEL_EXTS:                  tuple[str, ...] = ('.xlsx', '.xls')
CSV_EXTS:                    tuple[str, ...] = ('.csv',)

MIN_SEARCH_QUERY_LENGTH:     int = 2
SEARCH_HARD_LIMIT:           int = 200
SEARCH_RESULT_LIMIT:         int = 60

CATALOG_NODES_DEFAULT_LIMIT: int = 200
CATALOG_NODES_MAX_LIMIT:     int = 1000
CATALOG_NODES_OFFSET_MAX:    int = 10_000_000

INSIGHTS_CACHE_TTL:          int = 60 * 60
EXPLAIN_CACHE_TTL:           int = 60 * 60 * 24

CLAUDE_EXPLAIN_MODEL:        str = 'claude-sonnet-4-6'
CLAUDE_EXPLAIN_MAX_TOKENS:   int = 400


_LINEAGE_PROMPT_ORDER: dict[str, int] = {
    'feature':         0,
    'component':       1,
    'datalake':        2,
    'source':          2,
    'ingest':          3,
    'compute':         4,
    'transformation':  4,
    'collection':      4,
    'virtual':         5,
    'extract':         6,
    'datawarehouse':   7,
    'use_case':        8,
    'dashboard':       8,
}


def _build_incoming_adjacency(edges: list[dict]) -> dict[str, list[str]]:
    """Build the upstream adjacency map from a list of edge dicts.

    Args:
        edges (list[dict]): edges with at least ``source`` and ``target`` keys.

    Returns:
        dict[str, list[str]]: ``{target_id: [source_ids]}``.
    """
    adj: dict[str, list[str]] = {}
    for e in edges:
        adj.setdefault(e['target'], []).append(e['source'])
    return adj


def _catalog_edge_adjacencies(source: str = SOURCE_DC) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    """Single DB scan of the source's edge table producing both adjacency maps.

    Args:
        source (str): ``'dc'`` (default) or ``'odi'``.

    Returns:
        tuple[dict, dict]: ``(by_target, by_source)`` where each map is
        ``{node_id: [neighbour_ids]}``.
    """
    EdgeModel = _edge_model(source)
    by_target: dict[str, list[str]] = {}
    by_source: dict[str, list[str]] = {}
    for src, tgt in EdgeModel.objects.values_list('source_id', 'target_id'):
        by_target.setdefault(tgt, []).append(src)
        by_source.setdefault(src, []).append(tgt)
    return by_target, by_source


def _bfs_reachable(start_id: str, adjacency: dict[str, list[str]]) -> set[str]:
    """Collect every node reachable from ``start_id`` along the given adjacency.

    Args:
        start_id (str): the node to start the walk from.
        adjacency (dict[str, list[str]]): ``{node_id: [neighbour_ids]}``.

    Returns:
        set[str]: visited ids; ``start_id`` is NOT included.
    """
    visited: set[str] = set()
    queue:   list[str] = [start_id]
    while queue:
        cur = queue.pop()
        for nxt in adjacency.get(cur, ()):
            if nxt not in visited:
                visited.add(nxt)
                queue.append(nxt)
    return visited




def _slice_subgraph(node_ids: set[str], nodes: list[dict], edges: list[dict]) -> dict:
    """Extract the subgraph induced by ``node_ids``.

    Args:
        node_ids (set[str]): the ids to keep.
        nodes (list[dict]): the full node list to filter.
        edges (list[dict]): the full edge list to filter.

    Returns:
        dict: ``{'nodes': [...], 'edges': [...]}`` containing only items
        whose endpoints are all in ``node_ids``.
    """
    node_map:  dict[str, dict] = {n['id']: n for n in nodes}
    sub_nodes: list[dict]      = [node_map[nid] for nid in node_ids if nid in node_map]
    sub_edges: list[dict]      = [e for e in edges if e['source'] in node_ids and e['target'] in node_ids]
    return {'nodes': sub_nodes, 'edges': sub_edges}


def _build_ancestor_subgraph(node_id: str, nodes: list[dict], edges: list[dict]) -> dict:
    """Return the upstream subgraph: every ancestor of ``node_id`` plus the node itself.

    Args:
        node_id (str): the seed node.
        nodes (list[dict]): all nodes in the session.
        edges (list[dict]): all edges in the session.

    Returns:
        dict: ``{'nodes': [...], 'edges': [...]}`` for the upstream slice.
    """
    incoming  = _build_incoming_adjacency(edges)
    ancestors = _bfs_reachable(node_id, incoming)
    relevant  = ancestors | {node_id}
    return _slice_subgraph(relevant, nodes, edges)


def _build_deps_map(nodes: list[dict], edges: list[dict]) -> dict[str, list[str]]:
    """Map each node in ``nodes`` to the list of source ids that feed it.

    Args:
        nodes (list[dict]): the (small) lineage subgraph nodes.
        edges (list[dict]): edges contained in the same subgraph.

    Returns:
        dict[str, list[str]]: ``{node_id: [source_ids]}``.
    """
    deps: dict[str, list[str]] = {n['id']: [] for n in nodes}
    for e in edges:
        if e['target'] in deps:
            deps[e['target']].append(e['source'])
    return deps


def _format_node_line(node: dict, dep_ids: list[str], node_map: dict[str, dict]) -> str:
    """Render one bullet line of the lineage prompt.

    Args:
        node (dict): the node being described.
        dep_ids (list[str]): ids of nodes that feed it directly.
        node_map (dict[str, dict]): used to resolve dep labels.

    Returns:
        str: a French bullet line; either ``- "label" (type) ← dépend de : ...``
        or ``- "label" (type) ← donnée source (pas de dépendance)``.
    """
    dep_labels = [f'"{node_map[d]["label"]}"' for d in dep_ids if d in node_map]
    if dep_labels:
        return f'- "{node["label"]}" ({node["type"]}) ← dépend de : {", ".join(dep_labels)}'
    return f'- "{node["label"]}" ({node["type"]}) ← donnée source (pas de dépendance)'


def _format_lineage_for_prompt(node_id: str, subgraph: dict) -> str:
    """Serialise the upstream subgraph as a sources-first bullet list.

    Args:
        node_id (str): the seed node (unused in the body but kept for symmetry with callers).
        subgraph (dict): ``{'nodes': [...], 'edges': [...]}`` produced by
            ``_build_ancestor_subgraph``.

    Returns:
        str: the multi-line text to embed in the Claude prompt.
    """
    node_map = {n['id']: n for n in subgraph['nodes']}
    deps     = _build_deps_map(subgraph['nodes'], subgraph['edges'])
    ordered  = sorted(subgraph['nodes'], key=lambda n: _LINEAGE_PROMPT_ORDER.get(n['type'], 4))
    return '\n'.join(_format_node_line(n, deps[n['id']], node_map) for n in ordered)


def _get_claude_api_key() -> str | None:
    """Return the configured Claude API key, or None when running in demo mode.

    Returns:
        str | None: the key from settings, or None when missing / set to ``'mock'``.
    """
    key = getattr(settings, 'ANTHROPIC_API_KEY', None)
    if not key or key == 'mock':
        return None
    return key


def _build_explain_prompt(node: dict, lineage_text: str) -> str:
    """Compose the French explanation prompt sent to Claude for one node.

    Args:
        node (dict): the node whose lineage is being explained.
        lineage_text (str): the rendered upstream subgraph from ``_format_lineage_for_prompt``.

    Returns:
        str: the full user-side prompt.
    """
    return (
        "Tu es un expert en data lineage et reporting financier.\n\n"
        "On te donne le graphe de dépendances d'un indicateur. Explique en 3-4 phrases "
        f"claires comment \"{node['label']}\" est calculé, en décrivant le chemin depuis "
        "les données sources jusqu'au résultat final. Cite les nœuds par leur nom exact. "
        "Sois factuel et concis, ne suppose rien au-delà de ce qui est fourni.\n\n"
        "Graphe de dépendances :\n"
        f"{lineage_text}\n\n"
        "Réponds directement en français, sans introduction ni titre."
    )


def _format_demo_fallback(node: dict, lineage_text: str) -> str:
    """Build the structured fallback returned when no Claude API key is configured.

    Args:
        node (dict): the node being explained.
        lineage_text (str): the rendered upstream subgraph.

    Returns:
        str: a demo banner followed by the raw lineage text.
    """
    return (
        "[Mode démo — clé Claude API non configurée]\n\n"
        f"Voici le chemin de dépendances pour « {node['label']} » :\n\n"
        f"{lineage_text}"
    )


def _request_claude_explanation(api_key: str, prompt: str) -> str:
    """Call the Claude API and return the plain-text response, or an error string.

    Args:
        api_key (str): the API key returned by ``_get_claude_api_key``.
        prompt (str): the user prompt produced by ``_build_explain_prompt``.

    Returns:
        str: Claude's response text on success, or ``"Erreur lors de l'appel..."``
        on any exception (so callers can show it as the explanation).
    """
    try:
        import anthropic
        client  = anthropic.Anthropic(api_key=api_key, timeout=30.0)
        message = client.messages.create(
            model      = CLAUDE_EXPLAIN_MODEL,
            max_tokens = CLAUDE_EXPLAIN_MAX_TOKENS,
            messages   = [{'role': 'user', 'content': prompt}],
        )
        return message.content[0].text
    except Exception as e:
        return f"Erreur lors de l'appel Claude API : {e}"


def _call_claude(node: dict, lineage_text: str) -> str:
    """Produce an explanation: real API when configured, structured fallback otherwise.

    Args:
        node (dict): the node being explained.
        lineage_text (str): the rendered upstream subgraph.

    Returns:
        str: the explanation text (never raises).
    """
    api_key = _get_claude_api_key()
    if api_key is None:
        return _format_demo_fallback(node, lineage_text)
    return _request_claude_explanation(api_key, _build_explain_prompt(node, lineage_text))


def _cache_key(session_id: str) -> str:
    """Build the Redis key under which a session payload is stored.

    Args:
        session_id (str): UUID string identifying the session.

    Returns:
        str: ``"session:<uuid>"``.
    """
    return f"session:{session_id}"


def _get_session_id(request: object) -> str:
    """Extract or generate a session UUID from the ``X-Session-ID`` request header.

    Args:
        request (object): DRF ``Request`` whose ``headers`` carry ``X-Session-ID``.

    Returns:
        str: the validated UUID from the header, or a freshly minted one when
        the header is missing or malformed.
    """
    sid = request.headers.get('X-Session-ID', '').strip()
    try:
        uuid.UUID(sid)
        return sid
    except ValueError:
        return str(uuid.uuid4())


def _save_session(session_id: str, payload: dict) -> None:
    """Persist a session payload to Redis with the standard 24-hour TTL.

    Args:
        session_id (str): UUID identifying the session.
        payload (dict): the graph data (``nodes``, ``edges``, ``mode``, ...).
    """
    try:
        cache.set(_cache_key(session_id), payload, timeout=SESSION_TTL)
    except Exception:
        pass


def _load_session(session_id: str) -> dict | None:
    """Load a session payload from Redis.

    Args:
        session_id (str): UUID identifying the session.

    Returns:
        dict | None: the payload, or None when the key is missing / cache errors.
    """
    try:
        return cache.get(_cache_key(session_id))
    except Exception:
        return None


def _load_sessions_index() -> list:
    """Load the cap-50 global index of recent sessions from Redis.

    Returns:
        list: session metadata dicts, newest first. Empty list on miss/error.
    """
    try:
        data = cache.get(SESSIONS_INDEX_KEY)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _register_session(session_id: str, name: str, node_count: int, edge_count: int, mode: str) -> None:
    """Insert or update a session entry in the global sessions index.

    Args:
        session_id (str): UUID identifying the session.
        name (str): human-readable graph name (filename or user-supplied).
        node_count (int): number of nodes in the graph.
        edge_count (int): number of edges in the graph.
        mode (str): parsing mode — ``'formula'``, ``'structured'``, or ``'json'`` /
            ``'catalog'``.
    """
    index = _load_sessions_index()
    index = [e for e in index if e.get('session_id') != session_id]
    index.insert(0, {
        'session_id': session_id,
        'name':       name,
        'timestamp':  datetime.now(timezone.utc).isoformat(),
        'node_count': node_count,
        'edge_count': edge_count,
        'mode':       mode,
    })
    try:
        cache.set(SESSIONS_INDEX_KEY, index[:SESSIONS_INDEX_MAX], timeout=SESSIONS_INDEX_TTL)
    except Exception:
        pass


def _error(message: str) -> Response:
    """Build a DRF 400 Response carrying a single ``error`` message.

    Args:
        message (str): human-readable error message in the response body.

    Returns:
        Response: ``400 Bad Request`` with ``{'error': message}``.
    """
    return Response({'error': message}, status=status.HTTP_400_BAD_REQUEST)


def _split_files_by_format(files: list) -> tuple[list, list, list, list[str]]:
    """Partition uploaded files into JSON, Excel, CSV, and unsupported buckets.

    Args:
        files (list): uploaded file objects (Django ``UploadedFile``-like).

    Returns:
        tuple[list, list, list, list[str]]: ``(json_files, excel_files, csv_files, unsupported_names)``.
    """
    json_files  = [f for f in files if f.name.endswith(JSON_EXTS)]
    excel_files = [f for f in files if f.name.endswith(EXCEL_EXTS)]
    csv_files   = [f for f in files if f.name.endswith(CSV_EXTS)]
    bad         = [f.name for f in files
                   if f not in json_files and f not in excel_files and f not in csv_files]
    return json_files, excel_files, csv_files, bad


def _validate_file_set(files: list) -> Response | None:
    """Reject empty uploads, unsupported formats, and incompatible mixes.

    Excel and CSV may be uploaded together (both produce ParsedNode/ParsedEdge
    lists that compose cleanly). JSON exports are standalone — mixing them
    with any other format is rejected.

    Args:
        files (list): uploaded file objects.

    Returns:
        Response | None: a 400 Response when invalid, else None.
    """
    if not files:
        return _error('Aucun fichier fourni.')
    json_files, excel_files, csv_files, bad = _split_files_by_format(files)
    if bad:
        return _error(f"Format non supporté : {', '.join(bad)}. Utilisez .xlsx, .xls, .csv ou .json.")
    if json_files and (excel_files or csv_files):
        return _error('Ne mélangez pas JSON avec Excel ou CSV.')
    return None


def _node_dict_from_json(raw: dict) -> dict:
    """Normalise a JSON-uploaded node into the internal node-dict shape.

    Args:
        raw (dict): the node as parsed from the user's JSON upload.

    Returns:
        dict: ``{id, label, type, stage, sheet, metadata}`` with defaults applied.
    """
    return {
        'id':       raw['id'],
        'label':    raw.get('label', ''),
        'type':     raw.get('type', UNKNOWN_TYPE),
        'stage':    raw.get('stage'),
        'sheet':    raw.get('sheet'),
        'metadata': raw.get('metadata') or {},
    }


def _edge_dict_from_json(raw: dict) -> dict:
    """Normalise a JSON-uploaded edge into the internal edge-dict shape.

    Args:
        raw (dict): the edge as parsed from the user's JSON upload.

    Returns:
        dict: ``{source, target, action}``.
    """
    return {'source': raw['source'], 'target': raw['target'], 'action': raw.get('action')}


def _node_dict_from_parsed(parsed) -> dict:
    """Normalise a ParsedNode (Excel) into the internal node-dict shape.

    Args:
        parsed: a ``ParsedNode`` instance from ``catalog_parser``.

    Returns:
        dict: ``{id, label, type, stage, sheet, metadata}``.
    """
    return {
        'id':       parsed.node_id,
        'label':    parsed.label,
        'type':     parsed.node_type,
        'stage':    None,
        'sheet':    None,
        'metadata': parsed.metadata,
    }


def _edge_dict_from_parsed(parsed) -> dict:
    """Normalise a ParsedEdge (Excel) into the internal edge-dict shape.

    Args:
        parsed: a ``ParsedEdge`` instance from ``catalog_parser``.

    Returns:
        dict: ``{source, target, action}``.
    """
    return {'source': parsed.source_id, 'target': parsed.target_id, 'action': parsed.action}


def _parse_one_json_file(f) -> tuple[list[dict], list[dict], Response | None]:
    """Parse a single JSON file and return its nodes / edges, or an error Response.

    Args:
        f: an uploaded file with ``.read()`` and ``.name`` attributes.

    Returns:
        tuple[list, list, Response | None]: ``(nodes, edges, error_response)``.
        ``error_response`` is None on success.
    """
    try:
        data = json_lib.loads(f.read().decode('utf-8'))
    except Exception:
        return [], [], _error(f"{f.name} : JSON invalide.")
    nodes = [_node_dict_from_json(n) for n in data.get('nodes', [])]
    edges = [_edge_dict_from_json(e) for e in data.get('edges', [])]
    return nodes, edges, None


def _parse_one_excel_file(f) -> tuple[list[dict], list[dict], list[str], Response | None]:
    """Parse a single Excel file via GraphParser and return nodes/edges/warnings.

    Args:
        f: an uploaded file accepted by ``GraphParser``.

    Returns:
        tuple[list, list, list, Response | None]:
        ``(nodes, edges, warnings, error_response)``. ``error_response`` is
        None on success.
    """
    result = GraphParser(f).parse()
    if result.error:
        return [], [], [], _error(f"{f.name} : {result.error}")
    nodes = [_node_dict_from_parsed(n) for n in result.nodes]
    edges = [_edge_dict_from_parsed(e) for e in result.edges]
    return nodes, edges, list(result.warnings), None


def _parse_one_csv_file(f) -> tuple[list[dict], list[dict], list[str], Response | None]:
    """Parse a single CSV file via GraphParser (same code path as Excel).

    Format detection is handled inside ``GraphParser.parse`` based on the
    header set (currently routes ODI exports — interface/table/sens — to
    ``_build_odi_format``).

    Args:
        f: an uploaded ``.csv`` file with a ``.name`` attribute.

    Returns:
        tuple[list, list, list, Response | None]:
        ``(nodes, edges, warnings, error_response)``.
    """
    return _parse_one_excel_file(f)


def _route_file_into(
    nodes:    list[dict],
    edges:    list[dict],
    dc_nodes: list[dict],
    dc_edges: list[dict],
    odi_nodes: list[dict],
    odi_edges: list[dict],
) -> None:
    """Append a single parsed file's nodes/edges into the right bucket.

    A file is classified as ODI when at least one of its parsed nodes has
    ``type='odi_mapping'``. Otherwise it counts as DataCatalyst.

    Args:
        nodes (list[dict]): parsed nodes from one file.
        edges (list[dict]): parsed edges from the same file.
        dc_nodes / dc_edges / odi_nodes / odi_edges (list[dict]): the merged
            buckets the caller maintains; mutated in place.
    """
    if _has_odi_payload(nodes):
        odi_nodes.extend(nodes)
        odi_edges.extend(edges)
    else:
        dc_nodes.extend(nodes)
        dc_edges.extend(edges)


def _parse_uploaded_files(
    files: list,
) -> tuple[list[dict], list[dict], list[dict], list[dict], list[str], Response | None]:
    """Validate the upload set and dispatch to per-format parsers + per-source buckets.

    Each parsed file is classified as DC or ODI based on whether it contains
    any ``odi_mapping`` node. The two buckets travel separately so the import
    view can persist them to disjoint tables.

    Args:
        files (list): uploaded file objects.

    Returns:
        tuple: ``(dc_nodes, dc_edges, odi_nodes, odi_edges, warnings, error_response)``.
        When ``error_response`` is non-None, callers should return it as-is.
    """
    err = _validate_file_set(files)
    if err is not None:
        return [], [], [], [], [], err

    json_files, excel_files, csv_files, _ = _split_files_by_format(files)
    dc_nodes:     list[dict] = []
    dc_edges:     list[dict] = []
    odi_nodes:    list[dict] = []
    odi_edges:    list[dict] = []
    all_warnings: list[str]  = []

    for f in json_files:
        nodes, edges, err = _parse_one_json_file(f)
        if err is not None:
            return [], [], [], [], [], err
        _route_file_into(nodes, edges, dc_nodes, dc_edges, odi_nodes, odi_edges)

    for f in excel_files:
        nodes, edges, warnings, err = _parse_one_excel_file(f)
        if err is not None:
            return [], [], [], [], [], err
        _route_file_into(nodes, edges, dc_nodes, dc_edges, odi_nodes, odi_edges)
        all_warnings.extend(warnings)

    for f in csv_files:
        nodes, edges, warnings, err = _parse_one_csv_file(f)
        if err is not None:
            return [], [], [], [], [], err
        _route_file_into(nodes, edges, dc_nodes, dc_edges, odi_nodes, odi_edges)
        all_warnings.extend(warnings)

    return dc_nodes, dc_edges, odi_nodes, odi_edges, all_warnings, None


def _is_blank_field(value) -> bool:
    """True when a stored field carries no information (empty, None, or ``UNKNOWN_TYPE``).

    Args:
        value: any stored field value.

    Returns:
        bool: True when the value should be treated as missing.
    """
    return value in ('', UNKNOWN_TYPE, None)


def _merge_into_existing(obj: CatalogNode, incoming: dict) -> None:
    """Mutate an existing CatalogNode in place, never downgrading information.

    Rules:
        - ``type`` is kept as-is when already meaningful; a specific incoming type
          can only fill an unknown/empty slot.
        - ``label``, ``stage``, ``sheet`` are only adopted when the existing value
          is missing AND the incoming brings a non-empty value.
        - ``metadata`` is shallow-merged: incoming keys win on conflict but
          existing keys are never dropped.

    Args:
        obj (CatalogNode): the existing DB instance.
        incoming (dict): parsed payload describing the same node.
    """
    incoming_type = incoming.get('type') or UNKNOWN_TYPE
    if _is_blank_field(obj.type) and incoming_type != UNKNOWN_TYPE:
        obj.type = incoming_type

    if not obj.label and incoming.get('label'):
        obj.label = incoming['label']
    if not obj.stage and incoming.get('stage'):
        obj.stage = incoming['stage']
    if not obj.sheet and incoming.get('sheet'):
        obj.sheet = incoming['sheet']

    obj.metadata = {**(obj.metadata or {}), **(incoming.get('metadata') or {})}


def _build_new_node_for(NodeModel, incoming: dict):
    """Construct an unsaved node instance of the requested model from a dict.

    Args:
        NodeModel: ``CatalogNode`` or ``OdiNode``.
        incoming (dict): the normalised node-dict.

    Returns:
        Model instance ready for ``bulk_create``.
    """
    return NodeModel(
        node_id  = incoming['id'],
        label    = incoming.get('label') or incoming['id'],
        type     = incoming.get('type') or UNKNOWN_TYPE,
        stage    = incoming.get('stage') or None,
        sheet    = incoming.get('sheet') or None,
        metadata = incoming.get('metadata') or {},
    )


def _persist_nodes(source: str, incoming_nodes: list[dict]) -> tuple[int, int]:
    """Bulk-upsert nodes into the table matching ``source``.

    Existing rows are merged via ``_merge_into_existing`` to avoid losing
    information already in the DB (type, label, metadata).

    Args:
        source (str): ``'dc'`` or ``'odi'``.
        incoming_nodes (list[dict]): normalised node-dicts to upsert.

    Returns:
        tuple[int, int]: ``(added_count, updated_count)``.
    """
    NodeModel      = _node_model(source)
    incoming_ids   = [n['id'] for n in incoming_nodes]
    existing_by_id = {
        n.node_id: n for n in NodeModel.objects.filter(node_id__in=incoming_ids)
    }

    to_create: list = []
    to_update: list = []

    for n in incoming_nodes:
        existing = existing_by_id.get(n['id'])
        if existing:
            _merge_into_existing(existing, n)
            to_update.append(existing)
        else:
            to_create.append(_build_new_node_for(NodeModel, n))

    NodeModel.objects.bulk_create(to_create)
    if to_update:
        NodeModel.objects.bulk_update(to_update, ['label', 'type', 'stage', 'sheet', 'metadata'])
    return len(to_create), len(to_update)


def _persist_edges(source: str, incoming_edges: list[dict]) -> int:
    """Bulk-create edges in the table matching ``source``, between known nodes only.

    The ``before`` / ``after`` count() bracket is used instead of inspecting
    primary keys because ``bulk_create(ignore_conflicts=True)`` on SQLite often
    leaves ``pk=None`` on rows that were actually written.

    Args:
        source (str): ``'dc'`` or ``'odi'``.
        incoming_edges (list[dict]): normalised edge-dicts.

    Returns:
        int: number of edges actually persisted.
    """
    NodeModel = _node_model(source)
    EdgeModel = _edge_model(source)
    known_ids = set(NodeModel.objects.values_list('node_id', flat=True))
    edge_objs = [
        EdgeModel(source_id=e['source'], target_id=e['target'], action=e.get('action'))
        for e in incoming_edges
        if e['source'] in known_ids and e['target'] in known_ids
    ]
    before = EdgeModel.objects.count()
    EdgeModel.objects.bulk_create(edge_objs, ignore_conflicts=True)
    after  = EdgeModel.objects.count()
    return after - before


def _persist_catalog_nodes(incoming_nodes: list[dict]) -> tuple[int, int]:
    """Legacy alias kept for older call sites — always writes to the DC tables."""
    return _persist_nodes(SOURCE_DC, incoming_nodes)


def _persist_catalog_edges(incoming_edges: list[dict]) -> int:
    """Legacy alias kept for older call sites — always writes to the DC tables."""
    return _persist_edges(SOURCE_DC, incoming_edges)


def _has_odi_payload(nodes: list[dict]) -> bool:
    """True when at least one node in the payload is an ODI scenario.

    Used to route a parsed file to ``OdiNode``/``OdiEdge`` instead of the DC tables.

    Args:
        nodes (list[dict]): normalised node-dicts parsed from one file.

    Returns:
        bool: True when any node has type ``'odi_mapping'``.
    """
    return any(n.get('type') == 'odi_mapping' for n in nodes)


def _build_new_node(incoming: dict) -> CatalogNode:
    """Legacy alias kept for older call sites — builds a DC CatalogNode."""
    return _build_new_node_for(CatalogNode, incoming)


def _parse_int_param(value: str | None, default: int, lo: int, hi: int) -> int:
    """Safely parse an int query param, clamped to ``[lo, hi]``; default on failure.

    Args:
        value (str | None): the raw query-string value.
        default (int): returned when ``value`` is None or unparsable.
        lo (int): inclusive lower bound applied after parsing.
        hi (int): inclusive upper bound applied after parsing.

    Returns:
        int: the clamped integer.
    """
    try:
        n = int(value) if value is not None else default
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, n))


def _filter_catalog_nodes(source: str, query: str, node_type: str):
    """Build the filtered (unsliced) node queryset for ``source`` from query params.

    Args:
        source (str): ``'dc'`` or ``'odi'`` — picks the underlying table.
        query (str): substring matched case-insensitively against ``label``.
        node_type (str): exact match against ``type`` when non-empty.

    Returns:
        QuerySet: nodes of the matching model, before pagination.
    """
    qs = _node_model(source).objects.all()
    if node_type:
        qs = qs.filter(type=node_type)
    if query:
        qs = qs.filter(label__icontains=query)
    return qs


def _node_matches_query(node: dict, q_lower: str) -> bool:
    """True when the node's label or sheet contains the lowercased query.

    Args:
        node (dict): the node to test.
        q_lower (str): the already-lowercased query.

    Returns:
        bool: case-insensitive substring match on label OR sheet.
    """
    label = (node.get('label') or '').lower()
    sheet = (node.get('sheet') or '').lower()
    return q_lower in label or q_lower in sheet


def _search_result(node: dict, session_id: str, graph_name: str) -> dict:
    """Build the search-result payload for one matching node.

    Args:
        node (dict): the node that matched.
        session_id (str): UUID of the graph the node belongs to.
        graph_name (str): human-readable name of that graph.

    Returns:
        dict: ``{node_id, label, type, sheet, session_id, graph_name}``.
    """
    return {
        'node_id':    node['id'],
        'label':      node.get('label', ''),
        'type':       node.get('type', ''),
        'sheet':      node.get('sheet', ''),
        'session_id': session_id,
        'graph_name': graph_name,
    }


def _search_in_graph(
    graph_data: dict, q_lower: str, session_id: str, graph_name: str,
    seen: set[tuple], collector: list[dict],
) -> None:
    """Append matching nodes from one graph into the shared ``collector`` list.

    Args:
        graph_data (dict): a session payload with a ``nodes`` key.
        q_lower (str): the lowercased query.
        session_id (str): UUID of the graph being searched.
        graph_name (str): human-readable name of that graph.
        seen (set[tuple]): ``{(session_id, node_id)}`` of nodes already added.
        collector (list[dict]): mutable list receiving the matches.
    """
    for node in graph_data.get('nodes', ()):
        key = (session_id, node['id'])
        if key in seen:
            continue
        if not _node_matches_query(node, q_lower):
            continue
        seen.add(key)
        collector.append(_search_result(node, session_id, graph_name))


def _iter_saved_graphs(q_lower: str, seen: set[tuple], collector: list[dict]) -> set[str]:
    """Search every SavedGraph (SQLite) and return the session_ids that were scanned.

    Args:
        q_lower (str): the lowercased query.
        seen (set[tuple]): dedup set shared with ``_iter_cached_graphs``.
        collector (list[dict]): mutable list receiving the matches.

    Returns:
        set[str]: ids of the SavedGraphs that were searched.
    """
    saved_ids: set[str] = set()
    try:
        for sg in SavedGraph.objects.all():
            saved_ids.add(sg.session_id)
            _search_in_graph(sg.graph_data, q_lower, sg.session_id, sg.name, seen, collector)
    except Exception:
        pass
    return saved_ids


def _iter_cached_graphs(
    q_lower: str, saved_ids: set[str], seen: set[tuple], collector: list[dict],
) -> None:
    """Search Redis-only sessions not already covered by SavedGraph rows.

    Args:
        q_lower (str): the lowercased query.
        saved_ids (set[str]): session ids already scanned by ``_iter_saved_graphs``.
        seen (set[tuple]): dedup set shared across the two iterators.
        collector (list[dict]): mutable list receiving the matches; iteration
            stops once it reaches ``SEARCH_HARD_LIMIT``.
    """
    for entry in _load_sessions_index():
        if len(collector) >= SEARCH_HARD_LIMIT:
            return
        sid = entry['session_id']
        if sid in saved_ids:
            continue
        payload = _load_session(sid)
        if payload:
            _search_in_graph(payload, q_lower, sid, entry.get('name', sid), seen, collector)


def _sort_search_results(results: list[dict], q_lower: str) -> list[dict]:
    """Order results with prefix matches first, then alphabetically by label.

    Args:
        results (list[dict]): the unsorted matches.
        q_lower (str): the lowercased query.

    Returns:
        list[dict]: a fresh sorted list.
    """
    return sorted(
        results,
        key=lambda r: (0 if r['label'].lower().startswith(q_lower) else 1, r['label'].lower()),
    )


def _insights_cache_key(source: str = SOURCE_DC) -> str:
    """Compose the cache key for the insights payload of one source.

    The key includes the current ``(node_count, edge_count)`` so that any
    catalog write automatically lands on a different slot. Explicit
    invalidation in ``_invalidate_insights_cache`` covers the rest.

    Args:
        source (str): ``'dc'`` or ``'odi'``.

    Returns:
        str: ``"insights:<source>:<node_count>-<edge_count>"``.
    """
    NodeModel = _node_model(source)
    EdgeModel = _edge_model(source)
    return f"insights:{source}:{NodeModel.objects.count()}-{EdgeModel.objects.count()}"


def _invalidate_insights_cache() -> None:
    """Drop every cached insight payload, both DC and ODI. Called after any catalog write."""
    try:
        if hasattr(cache, 'delete_pattern'):
            cache.delete_pattern('insights:*')
        else:
            cache.delete(_insights_cache_key(SOURCE_DC))
            cache.delete(_insights_cache_key(SOURCE_ODI))
    except Exception:
        pass


class UploadView(APIView):
    """``POST /api/upload/`` — parse Excel or JSON files and store the result in Redis."""

    parser_classes = [MultiPartParser, FormParser]

    def post(self, request: object) -> Response:
        """Parse uploaded files and persist the result as a Redis-backed session.

        Args:
            request (object): DRF Request carrying multipart files under ``file`` /
                ``files`` and an optional ``name`` field.

        Returns:
            Response: ``{'session_id': <uuid>}`` plus the ``X-Session-ID`` header,
            or a 400 ``{'error': ...}`` Response from ``_parse_uploaded_files``.
        """
        files = request.FILES.getlist('file') or request.FILES.getlist('files')
        dc_nodes, dc_edges, odi_nodes, odi_edges, warnings, err = _parse_uploaded_files(files)
        if err is not None:
            return err

        nodes = dc_nodes + odi_nodes
        edges = dc_edges + odi_edges

        session_id   = _get_session_id(request)
        session_data = {'nodes': nodes, 'edges': edges, 'mode': 'catalog'}
        if warnings:
            session_data['warnings'] = warnings
        _save_session(session_id, session_data)

        graph_name = request.data.get('name', '').strip() or ', '.join(f.name for f in files)
        _register_session(session_id, graph_name, len(nodes), len(edges), 'catalog')

        return Response({'session_id': session_id}, headers={'X-Session-ID': session_id})


class SessionView(APIView):
    """``GET /api/session/`` — retrieve the graph data for the current session."""

    def get(self, request: object) -> Response:
        """Return the session payload, falling back to SQLite when Redis has expired.

        Args:
            request (object): DRF Request whose ``X-Session-ID`` header identifies
                the session.

        Returns:
            Response: the cached payload, or a 404 when nothing is found.
        """
        session_id = _get_session_id(request)
        payload    = _load_session(session_id)
        if payload is None:
            try:
                saved   = SavedGraph.objects.get(session_id=session_id)
                payload = saved.graph_data
                _save_session(session_id, payload)
            except SavedGraph.DoesNotExist:
                return Response({'detail': 'Aucune session trouvée.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(payload)


class GraphListView(APIView):
    """``GET /api/graphs/`` — returns the union of saved (SQLite) and cached (Redis) graphs."""

    def get(self, request: object) -> Response:
        """Build the two-bucket list of available graphs.

        Args:
            request (object): DRF Request (unused).

        Returns:
            Response: ``{'saved': [...], 'cached': [...]}`` where ``cached``
            excludes session ids already covered by ``saved``.
        """
        try:
            saved_qs = SavedGraph.objects.values('session_id', 'name', 'created_at', 'node_count', 'edge_count', 'mode')
            saved    = [
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
    """``POST /api/graphs/<session_id>/save/`` — persist a graph to SQLite.

    ``DELETE`` on the same URL removes it.
    """

    def post(self, request: object, session_id: str) -> Response:
        """Promote a Redis-only session to a persistent SavedGraph row.

        Args:
            request (object): DRF Request (unused beyond URL routing).
            session_id (str): UUID identifying the session to save.

        Returns:
            Response: ``{'status': 'saved'}`` on success, 404 when the session
            is gone from both Redis and SQLite.
        """
        payload = _load_session(session_id)
        if payload is None:
            try:
                existing = SavedGraph.objects.get(session_id=session_id)
                payload  = existing.graph_data
                _save_session(session_id, payload)
            except SavedGraph.DoesNotExist:
                return Response({'error': 'Session introuvable ou expirée.'}, status=status.HTTP_404_NOT_FOUND)
        index = _load_sessions_index()
        meta  = next((e for e in index if e['session_id'] == session_id), {})
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

    def delete(self, request: object, session_id: str) -> Response:
        """Remove a previously-saved graph from SQLite.

        Args:
            request (object): DRF Request (unused).
            session_id (str): UUID identifying the graph to delete.

        Returns:
            Response: ``{'status': 'removed'}``.
        """
        SavedGraph.objects.filter(session_id=session_id).delete()
        return Response({'status': 'removed'})


class GlobalSearchView(APIView):
    """``GET /api/search/?q=<query>`` — search nodes across all saved and cached graphs."""

    def get(self, request: object) -> Response:
        """Search every accessible graph for nodes matching the query.

        Args:
            request (object): DRF Request whose ``q`` query param carries the
                search string (case-insensitive substring match on label/sheet).

        Returns:
            Response: a list (capped at ``SEARCH_RESULT_LIMIT``) of matching node
            payloads ordered by prefix-match then label.
        """
        q = request.query_params.get('q', '').strip().lower()
        if len(q) < MIN_SEARCH_QUERY_LENGTH:
            return Response([])

        seen:    set[tuple] = set()
        results: list[dict] = []

        saved_ids = _iter_saved_graphs(q, seen, results)
        _iter_cached_graphs(q, saved_ids, seen, results)

        return Response(_sort_search_results(results, q)[:SEARCH_RESULT_LIMIT])


class CatalogImportView(APIView):
    """``POST /api/catalog/import/`` — parse files and upsert every node/edge into the catalog."""

    parser_classes = [MultiPartParser, FormParser]

    def post(self, request: object) -> Response:
        """Upsert the parsed nodes/edges into the persistent catalog tables.

        Args:
            request (object): DRF Request carrying multipart files.

        Returns:
            Response: import stats (``added_nodes`` / ``updated_nodes`` /
            ``added_edges`` / ``total_nodes`` / ``total_edges`` and optional
            ``warnings``), or a 400 from ``_parse_uploaded_files``.
        """
        files = request.FILES.getlist('file') or request.FILES.getlist('files')
        dc_nodes, dc_edges, odi_nodes, odi_edges, all_warnings, err = _parse_uploaded_files(files)
        if err is not None:
            return err

        with transaction.atomic():
            dc_added_nodes,  dc_updated_nodes  = _persist_nodes(SOURCE_DC,  dc_nodes)
            dc_added_edges                     = _persist_edges(SOURCE_DC,  dc_edges)
            odi_added_nodes, odi_updated_nodes = _persist_nodes(SOURCE_ODI, odi_nodes)
            odi_added_edges                    = _persist_edges(SOURCE_ODI, odi_edges)

        _invalidate_insights_cache()

        response = {
            'dc': {
                'added_nodes':   dc_added_nodes,
                'updated_nodes': dc_updated_nodes,
                'added_edges':   dc_added_edges,
                'total_nodes':   CatalogNode.objects.count(),
                'total_edges':   CatalogEdge.objects.count(),
            },
            'odi': {
                'added_nodes':   odi_added_nodes,
                'updated_nodes': odi_updated_nodes,
                'added_edges':   odi_added_edges,
                'total_nodes':   OdiNode.objects.count(),
                'total_edges':   OdiEdge.objects.count(),
            },
        }
        if all_warnings:
            response['warnings'] = all_warnings
        return Response(response)


class CatalogNodesView(APIView):
    """``GET /api/catalog/nodes/?q=&type=&offset=&limit=`` — browse the catalog with pagination."""

    def get(self, request: object) -> Response:
        """Return a filtered, paginated page of catalog nodes.

        Args:
            request (object): DRF Request with optional ``q``, ``type``,
                ``offset``, ``limit`` query params.

        Returns:
            Response: ``{nodes, offset, limit, matched, total}`` where
            ``matched`` is the row count after filtering, ``total`` is the
            entire catalog size.
        """
        source = _select_source(request)
        q      = request.query_params.get('q', '').strip().lower()
        typ    = request.query_params.get('type', '').strip()
        offset = _parse_int_param(request.query_params.get('offset'), 0, 0, CATALOG_NODES_OFFSET_MAX)
        limit  = _parse_int_param(
            request.query_params.get('limit'),
            CATALOG_NODES_DEFAULT_LIMIT, 1, CATALOG_NODES_MAX_LIMIT,
        )

        qs      = _filter_catalog_nodes(source, q, typ)
        matched = qs.count()
        page    = list(qs.values('node_id', 'label', 'type', 'stage', 'sheet', 'metadata')[offset:offset + limit])
        total   = _node_model(source).objects.count()

        return Response({
            'source':  source,
            'nodes':   page,
            'offset':  offset,
            'limit':   limit,
            'matched': matched,
            'total':   total,
        })


class CatalogGraphView(APIView):
    """``POST /api/catalog/graph/`` — build a session from a catalog node's full lineage."""

    parser_classes = [JSONParser]

    def post(self, request: object) -> Response:
        """Build a fresh session payload from the persistent catalog.

        The session is scoped to a single source (``dc`` or ``odi``); the
        other source never appears in the payload — they're stored in disjoint
        tables. When ``node_id`` is empty the full catalog of that source is
        exported. Otherwise a subgraph containing every upstream ancestor +
        downstream descendant of ``node_id`` (plus the seed) is returned.

        Args:
            request (object): DRF Request whose JSON body may carry
                ``node_id`` and an optional ``source`` (defaults to ``'dc'``).

        Returns:
            Response: ``{'session_id', 'node_count', 'edge_count', 'source'}``
            for the new session, or 404 when ``node_id`` is missing.
        """
        node_id = request.data.get('node_id', '').strip()
        source  = (request.data.get('source') or SOURCE_DC).lower()
        if source not in VALID_SOURCES:
            source = SOURCE_DC

        NodeModel = _node_model(source)
        EdgeModel = _edge_model(source)
        full_label = 'Catalogue complet' if source == SOURCE_DC else 'Catalogue ODI'

        if not node_id:
            nodes = _serialize_catalog_nodes(NodeModel.objects.all())
            edges = _serialize_catalog_edges(EdgeModel.objects.all())
            return _save_and_register_session(
                payload    = {'nodes': nodes, 'edges': edges, 'mode': 'catalog', 'source': source},
                graph_name = full_label,
            )

        try:
            seed = NodeModel.objects.get(node_id=node_id)
        except NodeModel.DoesNotExist:
            return Response(
                {'error': f'Nœud "{node_id}" introuvable dans le catalogue {source.upper()}.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        by_target, by_source = _catalog_edge_adjacencies(source)
        upstream     = _bfs_reachable(node_id, by_target)
        downstream   = _bfs_reachable(node_id, by_source)
        relevant_ids = upstream | downstream | {node_id}

        nodes = _serialize_catalog_nodes(NodeModel.objects.filter(node_id__in=relevant_ids))
        edges = _serialize_catalog_edges(EdgeModel.objects.filter(
            source_id__in=relevant_ids, target_id__in=relevant_ids,
        ))
        return _save_and_register_session(
            payload    = {'nodes': nodes, 'edges': edges, 'mode': 'catalog',
                          'source': source, 'seed_node_id': node_id},
            graph_name = seed.label,
        )


def _serialize_catalog_nodes(qs) -> list[dict]:
    """Convert a CatalogNode/OdiNode queryset into the wire-format node dicts.

    Args:
        qs: a queryset of node rows.

    Returns:
        list[dict]: ``{id, label, type, stage, sheet, metadata}`` for each row.
    """
    return [
        {'id': n.node_id, 'label': n.label, 'type': n.type,
         'stage': n.stage, 'sheet': n.sheet, 'metadata': n.metadata}
        for n in qs
    ]


def _serialize_catalog_edges(qs) -> list[dict]:
    """Convert a CatalogEdge/OdiEdge queryset into the wire-format edge dicts.

    Args:
        qs: a queryset of edge rows.

    Returns:
        list[dict]: ``{source, target, action}`` for each row.
    """
    return [
        {'source': e.source_id, 'target': e.target_id, 'action': e.action}
        for e in qs
    ]


def _save_and_register_session(payload: dict, graph_name: str) -> Response:
    """Persist a freshly-built session payload and register it in the index.

    Args:
        payload (dict): the session payload (must include ``nodes`` and ``edges``).
        graph_name (str): human-readable name stored in the sessions index.

    Returns:
        Response: ``{session_id, node_count, edge_count}`` plus the payload's
        ``source`` field when present.
    """
    session_id = str(uuid.uuid4())
    _save_session(session_id, payload)
    nodes = payload.get('nodes', [])
    edges = payload.get('edges', [])
    _register_session(session_id, graph_name, len(nodes), len(edges), payload.get('mode', 'catalog'))
    body = {'session_id': session_id, 'node_count': len(nodes), 'edge_count': len(edges)}
    if 'source' in payload:
        body['source'] = payload['source']
    return Response(body)


class InsightsView(APIView):
    """``GET /api/catalog/insights/`` — compute grouping/segmentation insights for the catalog.

    The payload is cached by ``(node_count, edge_count)``. Pass ``?force=1``
    to bypass the cache and recompute.
    """

    def get(self, request: object) -> Response:
        """Return the insight payload for the requested source, computing lazily on cache miss.

        Args:
            request (object): DRF Request with optional ``force=1`` and
                ``source=dc|odi`` query params.

        Returns:
            Response: the ``AllInsights`` dict from ``compute_all_insights``
            plus an ``X-Insights-Cache: HIT|MISS`` header.
        """
        from .insights import compute_all_insights

        source    = _select_source(request)
        force     = request.query_params.get('force') in ('1', 'true')
        cache_key = _insights_cache_key(source)

        if not force:
            cached = None
            try:
                cached = cache.get(cache_key)
            except Exception:
                cached = None
            if cached is not None:
                return Response(cached, headers={'X-Insights-Cache': 'HIT'})

        NodeModel = _node_model(source)
        EdgeModel = _edge_model(source)
        nodes = [
            {'id': n.node_id, 'label': n.label, 'type': n.type, 'metadata': n.metadata}
            for n in NodeModel.objects.all()
        ]
        edges = [
            {'source': e.source_id, 'target': e.target_id, 'action': e.action}
            for e in EdgeModel.objects.all()
        ]
        result = compute_all_insights(nodes, edges)

        try:
            cache.set(cache_key, result, timeout=INSIGHTS_CACHE_TTL)
        except Exception:
            pass

        return Response(result, headers={'X-Insights-Cache': 'MISS'})


class ClearAllView(APIView):
    """``DELETE /api/clear/`` — wipe the catalog (SQLite) and every session (Redis)."""

    def delete(self, request: object) -> Response:
        """Delete every CatalogNode/CatalogEdge row and flush the Redis cache.

        Args:
            request (object): DRF Request (unused).

        Returns:
            Response: ``{'status': 'cleared'}``.
        """
        CatalogEdge.objects.all().delete()
        CatalogNode.objects.all().delete()
        try:
            cache.clear()
        except Exception:
            pass
        return Response({'status': 'cleared'})


class ExplainView(APIView):
    """``POST /api/explain/`` — Claude-powered natural-language explanation for a single node.

    Body  : ``{"node_id": "..."}``
    Header: ``X-Session-ID: <uuid>`` (resolves the session whose nodes/edges feed the prompt)
    """
    parser_classes = [JSONParser]

    def post(self, request: object) -> Response:
        """Build the ancestor subgraph for a node and return a Claude-generated explanation.

        Args:
            request (object): DRF Request whose JSON body carries ``node_id``.
                The session is resolved from the ``X-Session-ID`` header.

        Returns:
            Response: ``200`` with ``{node_id, explanation, lineage_used}``, or
            ``400`` / ``404`` when ``node_id`` is missing or unknown.
        """
        node_id = request.data.get('node_id', '').strip()
        if not node_id:
            return Response({'error': 'node_id requis.'}, status=status.HTTP_400_BAD_REQUEST)

        session_id = _get_session_id(request)
        session    = _load_session(session_id)
        if not session:
            return Response(
                {'error': 'Session introuvable. Uploadez d\'abord un fichier.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        nodes:    list[dict]      = session.get('nodes', [])
        edges:    list[dict]      = session.get('edges', [])
        node_map: dict[str, dict] = {n['id']: n for n in nodes}

        if node_id not in node_map:
            return Response({'error': f'Nœud "{node_id}" introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        node         = node_map[node_id]
        subgraph     = _build_ancestor_subgraph(node_id, nodes, edges)
        lineage_text = _format_lineage_for_prompt(node_id, subgraph)

        lineage_hash       = hashlib.md5(lineage_text.encode()).hexdigest()
        explain_key        = f"explain:{node_id}:{lineage_hash}"
        cached_explanation = cache.get(explain_key)
        if cached_explanation:
            return Response({'node_id': node_id, 'explanation': cached_explanation, 'lineage_used': lineage_text})

        explanation = _call_claude(node, lineage_text)
        try:
            cache.set(explain_key, explanation, timeout=EXPLAIN_CACHE_TTL)
        except Exception:
            pass

        return Response({
            'node_id':      node_id,
            'explanation':  explanation,
            'lineage_used': lineage_text,
        })
