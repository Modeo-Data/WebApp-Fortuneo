"""
Parser mode 'structured' — lit un Excel avec des sheets nommées :

  Sources        | id | label | description
  Transformations| id | label | depends_on (virgule-séparé) | formula
  KPIs           | id | label | depends_on (virgule-séparé) | description

Les noms de sheets sont insensibles à la casse et aux accents.
Un fichier peut ne contenir qu'une partie des sheets.
"""
import openpyxl


_SHEET_ALIASES = {
    'sources':         'source',
    'source':          'source',
    'données':         'source',
    'donnees':         'source',
    'data':            'source',
    'inputs':          'source',
    'transformations': 'transformation',
    'transformation':  'transformation',
    'transfo':         'transformation',
    'calculs':         'transformation',
    'calculations':    'transformation',
    'kpis':            'kpi',
    'kpi':             'kpi',
    'indicateurs':     'kpi',
    'outputs':         'kpi',
}


def _normalize(name: str) -> str:
    return name.strip().lower()


def _rows_as_dicts(ws) -> list[dict]:
    """Convertit une sheet en liste de dicts en utilisant la ligne 1 comme headers."""
    headers = [str(cell.value).strip().lower() if cell.value else '' for cell in ws[1]]
    result = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not any(row):
            continue
        row_dict = {headers[i]: (row[i] if i < len(row) else None) for i in range(len(headers))}
        result.append(row_dict)
    return result


def _get(d: dict, *keys, default='') -> str:
    for k in keys:
        if k in d and d[k] is not None:
            return str(d[k]).strip()
    return default


def parse_structured(file) -> dict:
    try:
        wb = openpyxl.load_workbook(file, data_only=True)
    except Exception as e:
        return {'nodes': [], 'edges': [], '_error': str(e)}

    # Mapper les sheets détectées vers leur type
    typed_sheets: dict[str, str] = {}
    for sheet_name in wb.sheetnames:
        alias = _SHEET_ALIASES.get(_normalize(sheet_name))
        if alias:
            typed_sheets[sheet_name] = alias

    if not typed_sheets:
        return {
            'nodes': [],
            'edges': [],
            '_warning': (
                "Aucune sheet reconnue. "
                "Attendu : Sources, Transformations, KPIs "
                "(noms insensibles à la casse)."
            ),
        }

    nodes: list[dict] = []
    edges: list[dict] = []
    seen_ids: set[str] = set()

    for sheet_name, node_type in typed_sheets.items():
        ws = wb[sheet_name]
        rows = _rows_as_dicts(ws)

        for row in rows:
            nid = _get(row, 'id', 'identifiant', 'name', 'nom')
            if not nid or nid in seen_ids:
                continue
            seen_ids.add(nid)

            label = _get(row, 'label', 'libellé', 'libelle', 'nom', 'name') or nid

            # TODO: detect the tool/platform used for this node and pass it to the frontend
            # so that an operation node can be auto-inserted on its incoming edges.
            # Look for a column like: 'tool', 'platform', 'outil', 'technologie', 'tech'
            # Example: tool = _get(row, 'tool', 'platform', 'outil', 'technologie', 'tech') or None
            # Then include it in the node dict: {'id': nid, 'label': label, 'type': node_type, 'platformId': tool}
            # The frontend buildGraph() would then auto-create an OperationNode on edges leading into that node.
            nodes.append({'id': nid, 'label': label, 'type': node_type})

            # Dépendances (colonne depends_on, sources, dépend de…)
            deps_raw = _get(row, 'depends_on', 'sources', 'dépend de', 'depend de',
                            'inputs', 'from', 'de')
            for dep in deps_raw.split(','):
                dep = dep.strip()
                if dep and dep != nid:
                    edges.append({'source': dep, 'target': nid})

    return {'nodes': nodes, 'edges': edges}
