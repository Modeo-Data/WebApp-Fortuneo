from .formula import parse_formula
from .structured import parse_structured


def parse_excel(file, mode: str = 'formula') -> dict:
    """Route an uploaded Excel file to the correct parser based on mode.

    Args:
        file: Django uploaded file object (.xlsx / .xls).
        mode: Parsing strategy — 'formula' (auto-detect) or 'structured' (sheet-based).

    Returns:
        dict with keys 'nodes', 'edges', and optionally '_error' or '_warning'.
    """
    if mode == 'structured':
        return parse_structured(file)
    return parse_formula(file)


def merge_graphs(*graphs: dict) -> dict:
    """Merge multiple graphs into one by deduplicating nodes and edges.

    Args:
        *graphs: Any number of graph dicts, each containing 'nodes' and 'edges' lists.

    Returns:
        A single graph dict with deduplicated 'nodes' and 'edges'.
    """
    seen_nodes: dict[str, dict] = {}
    all_edges:  list[dict]      = []

    for g in graphs:
        for node in g.get('nodes', []):
            seen_nodes[node['id']] = node
        for edge in g.get('edges', []):
            key = (edge['source'], edge['target'])
            if key not in {(e['source'], e['target']) for e in all_edges}:
                all_edges.append(edge)

    return {
        'nodes': list(seen_nodes.values()),
        'edges': all_edges,
    }
