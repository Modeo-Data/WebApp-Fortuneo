from .formula import parse_formula
from .structured import parse_structured

def parse_excel(file, mode: str = 'formula') -> dict:
    """Route vers le bon parser selon le mode."""
    if mode == 'structured':
        return parse_structured(file)
    return parse_formula(file)


def merge_graphs(*graphs) -> dict:
    """Fusionne plusieurs graphes (nodes + edges) en dédupliquant les IDs."""
    seen_nodes = {}
    all_edges = []

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
