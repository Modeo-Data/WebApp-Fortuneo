"""
Parser mode 'structured' — lit un Excel avec des sheets nommées :

  Sources        | id | label | description
  Transformations| id | label | depends_on (virgule-séparé) | formula
  KPIs           | id | label | depends_on (virgule-séparé) | description

Les noms de sheets sont insensibles à la casse et aux accents.
Un fichier peut ne contenir qu'une partie des sheets.
"""
import openpyxl


# Maps normalised sheet name → (type, stage | None)
# stage is the dbt layer enum: 'staging' | 'core' | 'mart' | None
_SHEET_ALIASES: dict[str, tuple[str, str | None]] = {
    # source — données brutes
    'sources':          ('source', None),
    'source':           ('source', None),
    'raw':              ('source', None),
    'raws':             ('source', None),
    'données':          ('source', None),
    'donnees':          ('source', None),
    'data':             ('source', None),
    'inputs':           ('source', None),
    'brut':             ('source', None),
    'bruts':            ('source', None),
    # transformation — staging
    'staging':          ('transformation', 'staging'),
    'stg':              ('transformation', 'staging'),
    'stage':            ('transformation', 'staging'),
    # transformation — core
    'core':             ('transformation', 'core'),
    'intermediate':     ('transformation', 'core'),
    'int':              ('transformation', 'core'),
    'intermédiaire':    ('transformation', 'core'),
    'intermediaire':    ('transformation', 'core'),
    # transformation — mart
    'mart':             ('transformation', 'mart'),
    'marts':            ('transformation', 'mart'),
    'kpis':             ('transformation', 'mart'),
    'kpi':              ('transformation', 'mart'),
    'indicateurs':      ('transformation', 'mart'),
    # transformation — generic (no stage)
    'transformations':  ('transformation', None),
    'transformation':   ('transformation', None),
    'transfo':          ('transformation', None),
    'calculs':          ('transformation', None),
    'calculations':     ('transformation', None),
    'outputs':          ('transformation', None),
    # use_case — usage final
    'use_case':         ('use_case', None),
    'use_cases':        ('use_case', None),
    'usages':           ('use_case', None),
    'usage':            ('use_case', None),
    'dashboards':       ('use_case', None),
    'dashboard':        ('use_case', None),
    'tableaux de bord': ('use_case', None),
    'tableau de bord':  ('use_case', None),
    'rapports':         ('use_case', None),
    'reports':          ('use_case', None),
}


def _normalize(name: str) -> str:
    """Strip whitespace and lowercase a sheet name for alias lookup."""
    return name.strip().lower()


def _rows_as_dicts(ws: object) -> list[dict]:
    """Convert a worksheet to a list of row dicts keyed by lowercased column headers.

    Args:
        ws: An ``openpyxl`` ``Worksheet`` object.  Row 1 is treated as the header row.

    Returns:
        List of dicts — one per non-empty data row — with lowercased header strings as keys.
    """
    headers = [str(cell.value).strip().lower() if cell.value else '' for cell in ws[1]]
    result = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not any(row):
            continue
        row_dict = {headers[i]: (row[i] if i < len(row) else None) for i in range(len(headers))}
        result.append(row_dict)
    return result


def _get(d: dict, *keys: str, default: str = '') -> str:
    """Return the first non-None value found for any of the given keys in ``d``.

    Args:
        d: Row dict from :func:`_rows_as_dicts`.
        *keys: Candidate column names to try in order.
        default: Value to return when none of the keys are present or all are ``None``.

    Returns:
        Stripped string value of the first matching key, or ``default``.
    """
    for k in keys:
        if k in d and d[k] is not None:
            return str(d[k]).strip()
    return default


def parse_structured(file: object) -> dict:
    """Parse an Excel workbook that follows the explicit sheet-based schema.

    Expected sheet names (case-insensitive, accent-tolerant):

    - **Sources / Données / Data / Inputs** — columns: ``id``, ``label``, ``description``
    - **Transformations / Transfo / Calculs** — columns: ``id``, ``label``, ``depends_on``, ``formula``
    - **KPIs / Indicateurs / Outputs** — columns: ``id``, ``label``, ``depends_on``, ``description``

    The ``depends_on`` column is a comma-separated list of node IDs that the current node
    depends on.  Unknown sheets are silently ignored.

    Args:
        file: Django uploaded file object, opened in binary mode.

    Returns:
        dict with keys:

        - ``nodes`` (list[dict]): Each node has ``id``, ``label``, ``type``.
        - ``edges`` (list[dict]): Each edge has ``source`` and ``target`` node IDs.
        - ``_error`` (str, optional): Present when the workbook cannot be opened.
        - ``_warning`` (str, optional): Present when no recognised sheets are found.
    """
    try:
        wb = openpyxl.load_workbook(file, data_only=True)
    except Exception as e:
        return {'nodes': [], 'edges': [], '_error': str(e)}

    # Mapper les sheets détectées vers (type, stage)
    typed_sheets: dict[str, tuple[str, str | None]] = {}
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
                "Attendu : Sources, Staging, Core, Mart, Use_Case "
                "(noms insensibles à la casse)."
            ),
        }

    nodes: list[dict] = []
    edges: list[dict] = []
    seen_ids: set[str] = set()

    for sheet_name, (node_type, node_stage) in typed_sheets.items():
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
            node = {'id': nid, 'label': label, 'type': node_type}
            if node_stage:
                node['stage'] = node_stage
            nodes.append(node)

            # Dépendances (colonne depends_on, sources, dépend de…)
            deps_raw = _get(row, 'depends_on', 'sources', 'dépend de', 'depend de',
                            'inputs', 'from', 'de')
            for dep in deps_raw.split(','):
                dep = dep.strip()
                if dep and dep != nid:
                    edges.append({'source': dep, 'target': nid})

    return {'nodes': nodes, 'edges': edges}
