"""Insight engine — segmentation by flux.

A *flux* is the complete upstream subgraph feeding one sink. Sinks are either
explicit (dashboards, use_cases) or implicit (terminal datawarehouse nodes
with no outgoing data edges). The engine produces four insight families:

    fluxes               One per sink; the full upstream chain that feeds it.
    destination_families Groups of fluxes that converge on the same hub
                         (architectural pivots in the catalog).
    hot_spots            Data nodes read by many collections — bottlenecks
                         scored by fan-out times distinct features.
    duplicates           Collection pairs whose input sets are near-identical
                         (Jaccard >= JACCARD_THRESHOLD).

All public entry points are pure: they take ``(nodes, edges)`` lists and
return data only. All adjacency maps used internally are built once via
``build_context`` and shared across every find_X function.
"""

from collections import deque
from typing import TypedDict, NotRequired


SINK_TYPES:           set[str] = {'dashboard', 'use_case'}
COLLECTION_TYPES:     set[str] = {'collection', 'ingest', 'compute', 'extract', 'virtual'}
DATA_TYPES:           set[str] = {'datalake', 'datawarehouse'}
HIERARCHY_TYPES:      set[str] = {'feature', 'component'}
HUB_TYPES:            set[str] = {'datawarehouse', 'dashboard', 'use_case'}
JACCARD_THRESHOLD:    float    = 0.8
FLUX_OVERLAP:         float    = 0.5
MAX_HIERARCHY_DEPTH:  int      = 5
UNKNOWN_LABEL:        str      = 'unknown'
ORPHAN_FEATURE_KEY:   str      = '?'


class Node(TypedDict):
    id:       str
    label:    str
    type:     str
    metadata: NotRequired[dict]


class Edge(TypedDict):
    source: str
    target: str
    action: NotRequired[str | None]


class NodeRef(TypedDict):
    id:    str
    label: str


class FluxInsight(TypedDict):
    id:               str
    label:            str
    sink_type:        str
    feature:          str | None
    node_ids:         list[str]
    node_count:       int
    features:         list[str]
    cross_feature:    bool
    chain_length:     int
    datalake_count:   int
    collection_count: int


class DestinationFamily(TypedDict):
    hub_id:        str
    hub_label:     str
    hub_type:      str
    flux_ids:      list[str]
    flux_labels:   list[str]
    flux_count:    int
    features:      list[str]
    cross_feature: bool
    is_terminal:   bool


class HotSpotInsight(TypedDict):
    type:          str
    node_id:       str
    label:         str
    node_type:     str
    written_by:    list[NodeRef]
    read_by:       list[NodeRef]
    fan_out:       int
    feature_count: int
    features:      dict[str, int]
    cross_feature: bool
    score:         int


class DuplicatePair(TypedDict):
    id:      str
    label:   str
    feature: str | None


class DuplicateInsight(TypedDict):
    type:          str
    pair:          list[DuplicatePair]
    similarity:    float
    shared_inputs: list[str]
    diff_inputs:   list[str]
    same_sql:      bool
    same_feature:  bool
    suggestion:    str


class AllInsights(TypedDict):
    fluxes:                list[FluxInsight]
    destination_families:  list[DestinationFamily]
    hot_spots:             list[HotSpotInsight]
    duplicates:            list[DuplicateInsight]


NodeMap      = dict[str, Node]
AdjacencyMap = dict[str, list[str]]
HierarchyMap = dict[str, str]


class GraphContext:
    """Pre-computed lookup structures built once and shared across every insight pass.

    Every adjacency map is produced by a single linear scan of ``edges`` in
    ``build_context``. Without this context, each find_X function would rebuild
    the same maps independently, multiplying the cost by 3 to 4 times on large
    catalogs.

    Attributes:
        nodes (list[Node]): the original node dicts, unchanged.
        edges (list[Edge]): the original edge dicts, unchanged.
        node_map (dict[str, Node]): index of nodes by id.
        incoming (dict[str, list[str]]): {target_id: [source_ids]} for data edges only.
        outgoing (dict[str, list[str]]): {source_id: [target_ids]} for data edges only.
        parent_of (dict[str, str]): {child_id: parent_id} for feature -> component -> collection.
        writers_of (dict[str, list[str]]): {data_node_id: [big_ids writing to it]}.
        readers_of (dict[str, list[str]]): {data_node_id: [big_ids reading from it]}.
        collection_inputs (dict[str, set[str]]): {collection_id: set(input_ids)}.
    """

    __slots__ = (
        'nodes', 'edges',
        'node_map',
        'incoming', 'outgoing',
        'parent_of',
        'writers_of', 'readers_of',
        'collection_inputs',
    )

    def __init__(
        self,
        nodes:             list[Node],
        edges:             list[Edge],
        node_map:          NodeMap,
        incoming:          AdjacencyMap,
        outgoing:          AdjacencyMap,
        parent_of:         HierarchyMap,
        writers_of:        AdjacencyMap,
        readers_of:        AdjacencyMap,
        collection_inputs: dict[str, set[str]],
    ) -> None:
        self.nodes             = nodes
        self.edges             = edges
        self.node_map          = node_map
        self.incoming          = incoming
        self.outgoing          = outgoing
        self.parent_of         = parent_of
        self.writers_of        = writers_of
        self.readers_of        = readers_of
        self.collection_inputs = collection_inputs


def _build_node_map(nodes: list[Node]) -> NodeMap:
    """Index a node list by id for O(1) lookups.

    Args:
        nodes (list[Node]): the original node dicts.

    Returns:
        NodeMap: {node_id: node_dict}.
    """
    return {n['id']: n for n in nodes}


def _is_hierarchy(src_type: str | None, tgt_type: str | None) -> bool:
    """Classify an edge as hierarchy (feature -> component or component -> collection-type).

    Args:
        src_type (str | None): type of the edge's source node.
        tgt_type (str | None): type of the edge's target node.

    Returns:
        bool: True for hierarchy edges, False for data-flow edges.
    """
    if src_type == 'feature'   and tgt_type == 'component':       return True
    if src_type == 'component' and tgt_type in COLLECTION_TYPES:  return True
    return False


def build_context(nodes: list[Node], edges: list[Edge]) -> GraphContext:
    """Construct every adjacency map used by the insight engine in a single scan.

    Args:
        nodes (list[Node]): all nodes in the catalog graph.
        edges (list[Edge]): all edges in the catalog graph; each is classified
            as hierarchy or data flow based on its endpoint types.

    Returns:
        GraphContext: container of pre-computed maps ready for find_X calls.
    """
    node_map: NodeMap = _build_node_map(nodes)

    incoming:          AdjacencyMap          = {}
    outgoing:          AdjacencyMap          = {}
    parent_of:         HierarchyMap          = {}
    writers_of:        AdjacencyMap          = {}
    readers_of:        AdjacencyMap          = {}
    collection_inputs: dict[str, set[str]]   = {}

    for e in edges:
        src      = e['source']
        tgt      = e['target']
        src_type = node_map.get(src, {}).get('type')
        tgt_type = node_map.get(tgt, {}).get('type')

        if _is_hierarchy(src_type, tgt_type):
            parent_of[tgt] = src
            continue

        incoming.setdefault(tgt, []).append(src)
        outgoing.setdefault(src, []).append(tgt)

        if src_type not in DATA_TYPES and tgt_type in DATA_TYPES:
            writers_of.setdefault(tgt, []).append(src)
        if src_type in DATA_TYPES and tgt_type not in DATA_TYPES:
            readers_of.setdefault(src, []).append(tgt)
        if tgt_type in COLLECTION_TYPES:
            collection_inputs.setdefault(tgt, set()).add(src)

    return GraphContext(
        nodes=nodes, edges=edges,
        node_map=node_map,
        incoming=incoming, outgoing=outgoing,
        parent_of=parent_of,
        writers_of=writers_of, readers_of=readers_of,
        collection_inputs=collection_inputs,
    )


def _walk_up(node_id: str, target_type: str, parent_of: HierarchyMap, node_map: NodeMap) -> str | None:
    """Walk the parent chain until a node of target_type is reached or the depth cap hits.

    Args:
        node_id (str): id of the node to walk up from.
        target_type (str): the ancestor type to look for (e.g. ``'feature'``).
        parent_of (dict[str, str]): {child_id: parent_id} hierarchy map.
        node_map (dict[str, Node]): used to resolve the ancestor's label.

    Returns:
        str | None: the ancestor's label if found within MAX_HIERARCHY_DEPTH, else None.
    """
    current: str | None = parent_of.get(node_id)
    for _ in range(MAX_HIERARCHY_DEPTH):
        if current is None:
            return None
        if node_map.get(current, {}).get('type') == target_type:
            return node_map[current].get('label', current)
        current = parent_of.get(current)
    return None


def _feature_of(node_id: str, parent_of: HierarchyMap, node_map: NodeMap) -> str | None:
    """Resolve the owning feature label for a node, or None if the chain is broken.

    Args:
        node_id (str): id of the node whose owning feature is needed.
        parent_of (dict[str, str]): hierarchy map.
        node_map (dict[str, Node]): node lookup.

    Returns:
        str | None: the feature's label, or None if no feature ancestor is reachable.
    """
    return _walk_up(node_id, 'feature', parent_of, node_map)


def _node_ref(node_map: NodeMap, node_id: str) -> NodeRef:
    """Serialise a node as the minimal ``{id, label}`` dict used in payloads.

    Args:
        node_map (dict[str, Node]): node lookup; missing ids fall back to the raw id as label.
        node_id (str): the id to serialise.

    Returns:
        NodeRef: ``{'id': node_id, 'label': resolved_label}``.
    """
    return {'id': node_id, 'label': node_map.get(node_id, {}).get('label', node_id)}


def _is_explicit_sink(node: Node) -> bool:
    """True for dashboard / use_case nodes, which are always sinks by definition.

    Args:
        node (Node): the node to test.

    Returns:
        bool: True when the node's type is in SINK_TYPES.
    """
    return node.get('type') in SINK_TYPES


def _is_terminal_warehouse(node: Node, outgoing: AdjacencyMap) -> bool:
    """True for datawarehouse nodes that have no outgoing data edge.

    Args:
        node (Node): the candidate node.
        outgoing (dict[str, list[str]]): data-flow successors keyed by source id.

    Returns:
        bool: True when the node is a terminal datawarehouse (effective sink).
    """
    return node.get('type') == 'datawarehouse' and node['id'] not in outgoing


def _find_sinks(node_map: NodeMap, outgoing: AdjacencyMap) -> list[str]:
    """Collect every sink id (explicit dashboards plus terminal datawarehouses).

    Args:
        node_map (dict[str, Node]): node lookup.
        outgoing (dict[str, list[str]]): data-flow successors keyed by source id.

    Returns:
        list[str]: ids of all sink nodes in arbitrary order.
    """
    sinks: list[str] = []
    for nid, n in node_map.items():
        if _is_explicit_sink(n) or _is_terminal_warehouse(n, outgoing):
            sinks.append(nid)
    return sinks


def _walk_upstream(sink_id: str, incoming: AdjacencyMap) -> set[str]:
    """BFS upstream from sink_id along data edges and return the full ancestor set.

    Args:
        sink_id (str): the node to start the walk from.
        incoming (dict[str, list[str]]): {target_id: [source_ids]} data adjacency.

    Returns:
        set[str]: ``{sink_id} | all ancestors``.
    """
    visited: set[str] = {sink_id}
    queue: deque[str] = deque([sink_id])
    while queue:
        cur = queue.popleft()
        for src in incoming.get(cur, []):
            if src not in visited:
                visited.add(src)
                queue.append(src)
    return visited


def _flux_features(flux_nodes: set[str], parent_of: HierarchyMap, node_map: NodeMap) -> list[str]:
    """Resolve the distinct features owning collection-type nodes inside a flux.

    Args:
        flux_nodes (set[str]): node ids making up the flux.
        parent_of (dict[str, str]): hierarchy map.
        node_map (dict[str, Node]): node lookup.

    Returns:
        list[str]: alphabetically sorted distinct feature labels.
    """
    feats: set[str] = set()
    for nid in flux_nodes:
        if node_map.get(nid, {}).get('type') in COLLECTION_TYPES:
            feat = _feature_of(nid, parent_of, node_map)
            if feat:
                feats.add(feat)
    return sorted(feats)


def _collection_successors(
    collections: set[str], outgoing: AdjacencyMap, node_map: NodeMap,
) -> dict[str, list[str]]:
    """Build a collection-to-collection adjacency through single warehouse hops.

    A successor of collection A is any collection B such that
    ``A -> warehouse -> B`` exists in the data graph.

    Args:
        collections (set[str]): ids of all collection-type nodes in the flux.
        outgoing (dict[str, list[str]]): data-flow successors keyed by source id.
        node_map (dict[str, Node]): node lookup used to filter warehouses.

    Returns:
        dict[str, list[str]]: {collection_id: sorted list of reachable collection ids}.
    """
    succs: dict[str, list[str]] = {}
    for col in collections:
        reachable: set[str] = set()
        for hop in outgoing.get(col, []):
            if node_map.get(hop, {}).get('type') in DATA_TYPES:
                for nxt in outgoing.get(hop, []):
                    if nxt in collections:
                        reachable.add(nxt)
        if reachable:
            succs[col] = sorted(reachable)
    return succs


def _flux_chain_length(flux_nodes: set[str], outgoing: AdjacencyMap, node_map: NodeMap) -> int:
    """Compute the longest sequential chain of collections inside a flux.

    Uses DFS with memoisation over the collection-to-collection adjacency
    produced by ``_collection_successors``.

    Args:
        flux_nodes (set[str]): node ids making up the flux.
        outgoing (dict[str, list[str]]): data-flow successors keyed by source id.
        node_map (dict[str, Node]): node lookup.

    Returns:
        int: length of the longest chain (0 if no collections are present).
    """
    collections: set[str] = {
        nid for nid in flux_nodes
        if node_map.get(nid, {}).get('type') in COLLECTION_TYPES
    }
    if not collections:
        return 0

    successors: dict[str, list[str]] = _collection_successors(collections, outgoing, node_map)
    memo: dict[str, int] = {}

    def longest_from(nid: str) -> int:
        if nid in memo:
            return memo[nid]
        succs = successors.get(nid, [])
        memo[nid] = 1 + max((longest_from(s) for s in succs), default=0)
        return memo[nid]

    return max((longest_from(c) for c in collections), default=0)


def _count_by_type(flux_nodes: set[str], node_map: NodeMap, target_types: set[str]) -> int:
    """Count how many nodes in flux_nodes belong to target_types.

    Args:
        flux_nodes (set[str]): ids to scan.
        node_map (dict[str, Node]): node lookup.
        target_types (set[str]): the types to match against.

    Returns:
        int: number of matching nodes.
    """
    return sum(1 for nid in flux_nodes if node_map.get(nid, {}).get('type') in target_types)


def _flux_metrics(nodes_set: set[str], outgoing: AdjacencyMap, node_map: NodeMap) -> dict:
    """Compute the numeric summary of a flux (counts plus longest internal chain).

    Args:
        nodes_set (set[str]): node ids making up the flux.
        outgoing (dict[str, list[str]]): data-flow successors keyed by source id.
        node_map (dict[str, Node]): node lookup.

    Returns:
        dict: ``{node_count, chain_length, datalake_count, collection_count}``.
    """
    return {
        'node_count':       len(nodes_set),
        'chain_length':     _flux_chain_length(nodes_set, outgoing, node_map),
        'datalake_count':   _count_by_type(nodes_set, node_map, {'datalake'}),
        'collection_count': _count_by_type(nodes_set, node_map, COLLECTION_TYPES),
    }


def _primary_feature(features: list[str]) -> str | None:
    """Return the unique owning feature when unambiguous, else None (cross-feature flux).

    Args:
        features (list[str]): distinct features touched by a flux.

    Returns:
        str | None: the single feature label, or None when 0 or >= 2 features are present.
    """
    return features[0] if len(features) == 1 else None


def _build_flux(
    sink_id: str, incoming: AdjacencyMap, outgoing: AdjacencyMap,
    parent_of: HierarchyMap, node_map: NodeMap,
) -> FluxInsight:
    """Assemble the full FluxInsight payload for one sink.

    Args:
        sink_id (str): the sink that anchors this flux.
        incoming (dict[str, list[str]]): data-flow predecessors keyed by target id.
        outgoing (dict[str, list[str]]): data-flow successors keyed by source id.
        parent_of (dict[str, str]): hierarchy map for feature resolution.
        node_map (dict[str, Node]): node lookup.

    Returns:
        FluxInsight: serialised payload describing the flux.
    """
    nodes_set = _walk_upstream(sink_id, incoming)
    features  = _flux_features(nodes_set, parent_of, node_map)
    metrics   = _flux_metrics(nodes_set, outgoing, node_map)
    sink      = node_map[sink_id]

    return {
        'id':            sink_id,
        'label':         sink.get('label', sink_id),
        'sink_type':     sink.get('type', UNKNOWN_LABEL),
        'feature':       _primary_feature(features),
        'node_ids':      sorted(nodes_set),
        'features':      features,
        'cross_feature': len(features) > 1,
        **metrics,
    }


def find_fluxes(ctx: GraphContext) -> list[FluxInsight]:
    """Build one FluxInsight per sink, dropping orphan sinks (node_count <= 1).

    Args:
        ctx (GraphContext): pre-computed adjacency context.

    Returns:
        list[FluxInsight]: sorted by ``node_count`` descending.
    """
    sinks = _find_sinks(ctx.node_map, ctx.outgoing)
    fluxes = [
        _build_flux(s, ctx.incoming, ctx.outgoing, ctx.parent_of, ctx.node_map)
        for s in sinks
    ]
    fluxes = [f for f in fluxes if f['node_count'] > 1]
    fluxes.sort(key=lambda f: f['node_count'], reverse=True)
    return fluxes


def _hub_to_fluxes(fluxes: list[FluxInsight], node_map: NodeMap) -> dict[str, list[str]]:
    """Invert the fluxes list: for each hub (DWH/dashboard) list the fluxes that contain it.

    Args:
        fluxes (list[FluxInsight]): all detected fluxes.
        node_map (dict[str, Node]): node lookup used to filter hub-type nodes.

    Returns:
        dict[str, list[str]]: {hub_node_id: [flux_ids that include it]}.
    """
    out: dict[str, list[str]] = {}
    for f in fluxes:
        for nid in f['node_ids']:
            if node_map.get(nid, {}).get('type') in HUB_TYPES:
                out.setdefault(nid, []).append(f['id'])
    return out


def _is_terminal_hub(hub_id: str, outgoing: AdjacencyMap, node_map: NodeMap) -> bool:
    """True for hubs that are themselves sinks (dashboards or terminal warehouses).

    Args:
        hub_id (str): the hub to classify.
        outgoing (dict[str, list[str]]): data-flow successors keyed by source id.
        node_map (dict[str, Node]): node lookup.

    Returns:
        bool: True when the hub has no downstream consumers.
    """
    n = node_map.get(hub_id, {})
    if n.get('type') in SINK_TYPES:
        return True
    return n.get('type') == 'datawarehouse' and hub_id not in outgoing


def _family_features(flux_ids: list[str], flux_by_id: dict[str, FluxInsight]) -> list[str]:
    """Union of all features touched by the fluxes in a destination family.

    Args:
        flux_ids (list[str]): ids of fluxes belonging to the family.
        flux_by_id (dict[str, FluxInsight]): flux lookup.

    Returns:
        list[str]: alphabetically sorted distinct feature labels.
    """
    feats: set[str] = set()
    for fid in flux_ids:
        feats.update(flux_by_id.get(fid, {}).get('features', []))
    return sorted(feats)


def _build_family(
    hub_id: str, flux_ids: list[str], outgoing: AdjacencyMap,
    node_map: NodeMap, flux_by_id: dict[str, FluxInsight],
) -> DestinationFamily:
    """Assemble the DestinationFamily payload for a hub shared by several fluxes.

    Args:
        hub_id (str): the hub node id.
        flux_ids (list[str]): ids of the fluxes that converge on this hub.
        outgoing (dict[str, list[str]]): data-flow successors keyed by source id.
        node_map (dict[str, Node]): node lookup.
        flux_by_id (dict[str, FluxInsight]): flux lookup.

    Returns:
        DestinationFamily: serialised payload describing the family.
    """
    features = _family_features(flux_ids, flux_by_id)
    return {
        'hub_id':        hub_id,
        'hub_label':     node_map.get(hub_id, {}).get('label', hub_id),
        'hub_type':      node_map.get(hub_id, {}).get('type', UNKNOWN_LABEL),
        'flux_ids':      flux_ids,
        'flux_labels':   [flux_by_id[fid]['label'] for fid in flux_ids],
        'flux_count':    len(flux_ids),
        'features':      features,
        'cross_feature': len(features) > 1,
        'is_terminal':   _is_terminal_hub(hub_id, outgoing, node_map),
    }


def find_destination_families(
    fluxes: list[FluxInsight], ctx: GraphContext,
) -> list[DestinationFamily]:
    """Detect hubs (DWH/dashboard) touched by at least two fluxes.

    Args:
        fluxes (list[FluxInsight]): all detected fluxes.
        ctx (GraphContext): pre-computed adjacency context.

    Returns:
        list[DestinationFamily]: sorted by flux count desc, then feature spread desc, then hub label.
    """
    flux_by_id = {f['id']: f for f in fluxes}

    families: list[DestinationFamily] = []
    for hub_id, flux_ids in _hub_to_fluxes(fluxes, ctx.node_map).items():
        if len(flux_ids) < 2:
            continue
        families.append(_build_family(hub_id, flux_ids, ctx.outgoing, ctx.node_map, flux_by_id))

    families.sort(key=lambda f: (-f['flux_count'], -len(f['features']), f['hub_label']))
    return families


def _feature_breakdown(
    reader_ids: list[str], parent_of: HierarchyMap, node_map: NodeMap,
) -> dict[str, list[str]]:
    """Group reader ids by their owning feature, bucketing orphans under ORPHAN_FEATURE_KEY.

    Args:
        reader_ids (list[str]): ids of collections reading the same data node.
        parent_of (dict[str, str]): hierarchy map.
        node_map (dict[str, Node]): node lookup.

    Returns:
        dict[str, list[str]]: {feature_label: [reader_ids]}.
    """
    feat_map: dict[str, list[str]] = {}
    for rid in reader_ids:
        feat = _feature_of(rid, parent_of, node_map) or ORPHAN_FEATURE_KEY
        feat_map.setdefault(feat, []).append(rid)
    return feat_map


def _hot_spot_score(reader_count: int, feature_count: int) -> int:
    """Compose the hot-spot severity score (fan-out weighted by feature breadth).

    Args:
        reader_count (int): number of collections reading this data node.
        feature_count (int): number of distinct features those readers belong to.

    Returns:
        int: higher means the node is a more critical pivot.
    """
    return reader_count * max(feature_count, 1)


def _build_hot_spot_payload(small_id: str, readers: list[str], ctx: GraphContext) -> HotSpotInsight:
    """Assemble one HotSpotInsight for a data node with at least two consumers.

    Args:
        small_id (str): id of the data node (datalake or datawarehouse).
        readers (list[str]): ids of the collections that read from it.
        ctx (GraphContext): pre-computed adjacency context.

    Returns:
        HotSpotInsight: serialised payload describing the hot spot.
    """
    feat_map = _feature_breakdown(readers, ctx.parent_of, ctx.node_map)
    node     = ctx.node_map.get(small_id, {})
    return {
        'type':          'hot_spot',
        'node_id':       small_id,
        'label':         node.get('label', small_id),
        'node_type':     node.get('type', UNKNOWN_LABEL),
        'written_by':    [_node_ref(ctx.node_map, w) for w in ctx.writers_of.get(small_id, [])],
        'read_by':       [_node_ref(ctx.node_map, r) for r in readers],
        'fan_out':       len(readers),
        'feature_count': len(feat_map),
        'features':      {f: len(c) for f, c in feat_map.items()},
        'cross_feature': len(feat_map) > 1,
        'score':         _hot_spot_score(len(readers), len(feat_map)),
    }


def find_hot_spots(ctx: GraphContext) -> list[HotSpotInsight]:
    """Detect data nodes read by at least two collections, scored by fan-out times features.

    Args:
        ctx (GraphContext): pre-computed adjacency context.

    Returns:
        list[HotSpotInsight]: sorted by score descending.
    """
    results = [
        _build_hot_spot_payload(small_id, readers, ctx)
        for small_id, readers in ctx.readers_of.items()
        if len(readers) >= 2
    ]
    results.sort(key=lambda x: x['score'], reverse=True)
    return results


def _jaccard(a: set[str], b: set[str]) -> float:
    """Compute the Jaccard similarity index between two sets.

    Args:
        a (set[str]): first set.
        b (set[str]): second set.

    Returns:
        float: ``|a & b| / |a | b|``, or 0.0 when both are empty.
    """
    union = a | b
    return len(a & b) / len(union) if union else 0.0


def _invert_inputs(collection_inputs: dict[str, set[str]]) -> dict[str, list[str]]:
    """Invert the collection-to-inputs map into the per-input list of consumers.

    Args:
        collection_inputs (dict[str, set[str]]): {collection_id: set(input_ids)}.

    Returns:
        dict[str, list[str]]: {input_id: [collection_ids that read it]}.
    """
    by_input: dict[str, list[str]] = {}
    for col_id, inputs in collection_inputs.items():
        for inp in inputs:
            by_input.setdefault(inp, []).append(col_id)
    return by_input


def _candidate_pairs(
    collection_inputs: dict[str, set[str]],
    by_input:          dict[str, list[str]],
    threshold:         float,
) -> list[tuple[str, str]]:
    """Enumerate unordered collection pairs that could reach the Jaccard threshold.

    Two short-circuits make this near-O(n) in practice:
      - Disjoint pairs (no shared input) are never considered.
      - Pairs whose sizes differ too much can never reach ``threshold`` and are
        skipped before any set arithmetic.

    Args:
        collection_inputs (dict[str, set[str]]): {collection_id: set(input_ids)}.
        by_input (dict[str, list[str]]): inverted index produced by ``_invert_inputs``.
        threshold (float): the Jaccard threshold the caller will apply.

    Returns:
        list[tuple[str, str]]: deduplicated ``(a, b)`` pairs with ``a < b``.
    """
    seen:  set[tuple[str, str]] = set()
    pairs: list[tuple[str, str]] = []
    for col_id, inputs in collection_inputs.items():
        size_a = len(inputs)
        if size_a == 0:
            continue
        for inp in inputs:
            for other in by_input.get(inp, ()):
                if other == col_id:
                    continue
                size_b = len(collection_inputs.get(other, ()))
                if size_b == 0:
                    continue
                if min(size_a, size_b) < threshold * max(size_a, size_b):
                    continue
                key = (col_id, other) if col_id < other else (other, col_id)
                if key in seen:
                    continue
                seen.add(key)
                pairs.append(key)
    return pairs


def _share_sql_script(a_node: Node, b_node: Node) -> bool:
    """True when both collections were built from the same SQL file (matching ``nom_sql``).

    Args:
        a_node (Node): first collection node.
        b_node (Node): second collection node.

    Returns:
        bool: True when ``metadata.nom_sql`` exists and is equal on both sides.
    """
    a_sql = (a_node.get('metadata') or {}).get('nom_sql')
    b_sql = (b_node.get('metadata') or {}).get('nom_sql')
    return a_sql is not None and a_sql == b_sql


def _labels_in(node_map: NodeMap, ids: set[str]) -> list[str]:
    """Resolve a set of node ids to their labels, dropping unknowns.

    Args:
        node_map (dict[str, Node]): node lookup.
        ids (set[str]): ids to resolve.

    Returns:
        list[str]: labels in insertion order; ids missing from node_map are skipped.
    """
    return [node_map[nid].get('label', nid) for nid in ids if nid in node_map]


def _build_duplicate_payload(
    a_id: str, b_id: str, a_in: set[str], b_in: set[str], sim: float,
    parent_of: HierarchyMap, node_map: NodeMap,
) -> DuplicateInsight:
    """Assemble the DuplicateInsight payload for a pair that already passed the threshold.

    Args:
        a_id (str): id of the first collection.
        b_id (str): id of the second collection.
        a_in (set[str]): inputs of the first collection.
        b_in (set[str]): inputs of the second collection.
        sim (float): the Jaccard similarity already computed by the caller.
        parent_of (dict[str, str]): hierarchy map.
        node_map (dict[str, Node]): node lookup.

    Returns:
        DuplicateInsight: serialised payload describing the duplicate pair.
    """
    a       = node_map.get(a_id, {})
    b       = node_map.get(b_id, {})
    feat_a  = _feature_of(a_id, parent_of, node_map)
    feat_b  = _feature_of(b_id, parent_of, node_map)
    same    = _share_sql_script(a, b)

    return {
        'type':          'duplicate',
        'pair': [
            {'id': a_id, 'label': a.get('label', a_id), 'feature': feat_a},
            {'id': b_id, 'label': b.get('label', b_id), 'feature': feat_b},
        ],
        'similarity':    round(sim, 2),
        'shared_inputs': _labels_in(node_map, a_in & b_in),
        'diff_inputs':   _labels_in(node_map, (a_in - b_in) | (b_in - a_in)),
        'same_sql':      same,
        'same_feature':  feat_a == feat_b,
        'suggestion':    'regrouper' if same else 'examiner',
    }


def _try_duplicate(
    a_id: str, b_id: str, a_in: set[str], b_in: set[str],
    parent_of: HierarchyMap, node_map: NodeMap,
) -> DuplicateInsight | None:
    """Decide whether the pair is a duplicate and build its payload, or return None.

    Args:
        a_id (str): id of the first collection.
        b_id (str): id of the second collection.
        a_in (set[str]): inputs of the first collection.
        b_in (set[str]): inputs of the second collection.
        parent_of (dict[str, str]): hierarchy map.
        node_map (dict[str, Node]): node lookup.

    Returns:
        DuplicateInsight | None: payload when Jaccard >= JACCARD_THRESHOLD, else None.
    """
    sim = _jaccard(a_in, b_in)
    if sim < JACCARD_THRESHOLD:
        return None
    return _build_duplicate_payload(a_id, b_id, a_in, b_in, sim, parent_of, node_map)


def find_duplicates(ctx: GraphContext) -> list[DuplicateInsight]:
    """Detect collection pairs whose input sets exceed JACCARD_THRESHOLD.

    Args:
        ctx (GraphContext): pre-computed adjacency context.

    Returns:
        list[DuplicateInsight]: sorted by similarity descending.
    """
    by_input = _invert_inputs(ctx.collection_inputs)
    pairs    = _candidate_pairs(ctx.collection_inputs, by_input, JACCARD_THRESHOLD)

    results: list[DuplicateInsight] = []
    for a_id, b_id in pairs:
        insight = _try_duplicate(
            a_id, b_id,
            ctx.collection_inputs[a_id],
            ctx.collection_inputs[b_id],
            ctx.parent_of, ctx.node_map,
        )
        if insight:
            results.append(insight)
    results.sort(key=lambda x: x['similarity'], reverse=True)
    return results


def compute_all_insights(nodes: list[Node], edges: list[Edge]) -> AllInsights:
    """Compute every insight family in a single pass, sharing one GraphContext.

    Args:
        nodes (list[Node]): all nodes in the catalog graph.
        edges (list[Edge]): all edges in the catalog graph.

    Returns:
        AllInsights: ``{fluxes, destination_families, hot_spots, duplicates}``.
    """
    ctx    = build_context(nodes, edges)
    fluxes = find_fluxes(ctx)
    return {
        'fluxes':                fluxes,
        'destination_families':  find_destination_families(fluxes, ctx),
        'hot_spots':             find_hot_spots(ctx),
        'duplicates':            find_duplicates(ctx),
    }
