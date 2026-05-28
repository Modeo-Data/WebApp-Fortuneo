"""
Parser mode 'formula' — analyse les formules Excel et reconstruit
automatiquement le graphe de dépendances entre colonnes.

Logique :
  1. Lire toutes les sheets, row 1 = headers de colonnes
  2. Pour chaque cellule avec une formule, extraire les colonnes référencées
  3. Grouper par colonne (une colonne = un nœud)
  4. Classifier :
       - source      : colonne sans formules, référencée par d'autres
       - transformation : colonne avec formule, référencée par d'autres colonnes
       - kpi         : colonne avec formule, jamais référencée (terminale)
"""
import re
import openpyxl
from openpyxl.utils import get_column_letter


# Mots-clés Excel à exclure (fonctions, opérateurs…)
_EXCEL_FUNCTIONS = {
    'SUM', 'AVERAGE', 'COUNT', 'IF', 'AND', 'OR', 'NOT',
    'VLOOKUP', 'HLOOKUP', 'INDEX', 'MATCH', 'OFFSET',
    'LEFT', 'RIGHT', 'MID', 'LEN', 'TRIM', 'CONCATENATE',
    'DATE', 'TODAY', 'NOW', 'YEAR', 'MONTH', 'DAY',
    'MAX', 'MIN', 'ROUND', 'ABS', 'SQRT', 'POWER',
    'IFERROR', 'ISBLANK', 'TEXT', 'VALUE', 'TRUE', 'FALSE',
    'SUMIF', 'COUNTIF', 'AVERAGEIF', 'SUMPRODUCT', 'LARGE', 'SMALL',
}


def _slug(text: str) -> str:
    """Convert a string to a lowercase alphanumeric slug (underscores as separators)."""
    return re.sub(r'[^a-z0-9]+', '_', str(text).strip().lower()).strip('_')


def _node_id(sheet: str, col: str, headers: dict[str, str]) -> str:
    """Build a unique node identifier from sheet name and column letter.

    Args:
        sheet: Sheet name.
        col: Column letter (e.g. 'A', 'BC').
        headers: Mapping of column letter → header label for this sheet.

    Returns:
        A slug of the form ``<sheet_slug>__<label_slug>`` or ``<sheet_slug>__<col_lower>``.
    """
    label = headers.get(col)
    if label:
        return f"{_slug(sheet)}__{_slug(label)}"
    return f"{_slug(sheet)}__{col.lower()}"


def _node_label(sheet: str, col: str, headers: dict[str, str]) -> str:
    """Return the human-readable label for a node.

    Args:
        sheet: Sheet name.
        col: Column letter.
        headers: Mapping of column letter → header label for this sheet.

    Returns:
        The header value if available, otherwise ``"<sheet> <col>"``.
    """
    label = headers.get(col)
    if label:
        return str(label)
    return f"{sheet} {col}"


def _extract_refs(formula: str, current_sheet: str) -> list[tuple[str, str]]:
    """
    Retourne une liste de (sheet_name, col_letter) référencées dans la formule.
    Gère : A1, $A$1, Sheet1!A1, 'Mon Sheet'!A1, plages A1:B3.
    """
    refs = set()

    # 1. Références cross-sheet avec apostrophes : 'Sheet Name'!A1
    for m in re.finditer(r"'([^']+)'!\$?([A-Z]{1,3})\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?", formula):
        sheet, col = m.group(1), m.group(2)
        refs.add((sheet, col))

    # 2. Références cross-sheet sans apostrophes : Sheet1!A1
    for m in re.finditer(r"(?<!')\b([A-Za-z_][\w]*[A-Za-z_][\w]*)!\$?([A-Z]{1,3})\$?\d+", formula):
        name, col = m.group(1), m.group(2)
        if name.upper() not in _EXCEL_FUNCTIONS:
            refs.add((name, col))

    # Nettoie les refs cross-sheet pour éviter doubles
    clean = re.sub(r"'[^']+'!\$?[A-Z]{1,3}\$?\d+", '', formula)
    clean = re.sub(r"\b[A-Za-z_][\w]*!\$?[A-Z]{1,3}\$?\d+", '', clean)

    # 3. Références same-sheet : A1, $A$1, A1:B3
    for m in re.finditer(r"\$?([A-Z]{1,3})\$?(\d+)(?!\s*\()", clean):
        col, row = m.group(1), int(m.group(2))
        if col not in _EXCEL_FUNCTIONS and row > 1:  # row 1 = headers
            refs.add((current_sheet, col))

    return list(refs)


def parse_formula(file: object) -> dict:
    """Parse an Excel workbook by analysing cell formulas and inferring the dependency graph.

    Reads every sheet, treats row 1 as column headers, then walks all formula cells to
    extract cross-column references.  Nodes are classified as:

    - ``source``         — column with no formula, referenced by others.
    - ``transformation`` — column with a formula that is itself referenced by others.
    - ``kpi``            — column with a formula that is never referenced (terminal node).

    Args:
        file: Django uploaded file object (``InMemoryUploadedFile`` or similar), opened in
              binary mode.  Must be a valid ``.xlsx`` or ``.xls`` workbook.

    Returns:
        dict with keys:

        - ``nodes`` (list[dict]): Each node has ``id``, ``label``, ``type``, ``sheet``.
        - ``edges`` (list[dict]): Each edge has ``source`` and ``target`` node IDs.
        - ``_error`` (str, optional): Present when the workbook cannot be opened.
        - ``_warning`` (str, optional): Present when no formulas are detected.
    """
    try:
        wb = openpyxl.load_workbook(file, data_only=False)
    except Exception as e:
        return {'nodes': [], 'edges': [], '_error': str(e)}

    # ── Étape 1 : construire la map headers par sheet ─────────────────────────
    sheet_headers: dict[str, dict[str, str]] = {}
    for name in wb.sheetnames:
        ws = wb[name]
        headers = {}
        for cell in ws[1]:
            if cell.value is not None:
                headers[get_column_letter(cell.column)] = str(cell.value).strip()
        sheet_headers[name] = headers

    # ── Étape 2 : parcourir les formules ──────────────────────────────────────
    # formula_cols : colonnes qui contiennent des formules
    # source_cols  : colonnes apparaissant dans le membre gauche d'une edge
    formula_cols: set[tuple[str, str]] = set()  # (sheet, col)
    all_cols:     set[tuple[str, str]] = set()
    raw_edges:    set[tuple[str, str]] = set()  # (node_id_source, node_id_target)

    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        headers = sheet_headers[sheet_name]

        for row in ws.iter_rows(min_row=2):
            for cell in row:
                val = cell.value
                if not isinstance(val, str) or not val.startswith('='):
                    continue

                col = get_column_letter(cell.column)
                target_id = _node_id(sheet_name, col, headers)
                formula_cols.add((sheet_name, col))
                all_cols.add((sheet_name, col))

                for ref_sheet, ref_col in _extract_refs(val, sheet_name):
                    # Vérifier que le sheet existe dans le classeur
                    if ref_sheet not in wb.sheetnames:
                        continue
                    ref_headers = sheet_headers.get(ref_sheet, {})
                    source_id = _node_id(ref_sheet, ref_col, ref_headers)
                    all_cols.add((ref_sheet, ref_col))
                    if source_id != target_id:
                        raw_edges.add((source_id, target_id))

    if not all_cols:
        return {'nodes': [], 'edges': [], '_warning': 'Aucune formule détectée dans ce fichier.'}

    # ── Étape 3 : classifier les nœuds ───────────────────────────────────────
    formula_node_ids = {
        _node_id(s, c, sheet_headers.get(s, {}))
        for s, c in formula_cols
    }
    source_in_edges = {e[0] for e in raw_edges}  # nœuds qui alimentent d'autres

    nodes = []
    seen_ids: set[str] = set()

    for sheet, col in all_cols:
        headers = sheet_headers.get(sheet, {})
        nid = _node_id(sheet, col, headers)
        if nid in seen_ids:
            continue
        seen_ids.add(nid)

        is_formula = (sheet, col) in formula_cols
        is_referenced_by_others = nid in source_in_edges

        if not is_formula:
            node_type = 'source'
        elif is_referenced_by_others:
            node_type = 'transformation'
        else:
            node_type = 'kpi'

        # TODO: detect the tool/platform used to produce this column and pass it to the frontend.
        # In formula mode this is hard to infer automatically — one approach would be to
        # look for a dedicated metadata sheet (e.g. "Pipeline") with columns like:
        #   column_id | tool | dag_name
        # and cross-reference node IDs against it.
        # The matched platformId would then be included here so the frontend can
        # auto-insert an OperationNode on the edges leading into this node.
        nodes.append({
            'id': nid,
            'label': _node_label(sheet, col, headers),
            'type': node_type,
            'sheet': sheet,
        })

    edges = [{'source': s, 'target': t} for s, t in raw_edges]

    return {'nodes': nodes, 'edges': edges}
