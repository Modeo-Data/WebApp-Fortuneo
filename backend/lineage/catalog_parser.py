"""Excel/JSON catalog parser — turns client spreadsheets into ParsedNode/ParsedEdge lists.

Two formats are supported:

* **Wide format**: one row per collection with semicolon-separated input columns
  (``bdd_entree``, ``table_entree``) and a single output (``bdd_sortie``,
  ``table_sortie``). This is the production shape used by the client.
* **Long format** (legacy): one row per ``(source, action, target)`` triple, with
  optional ``type`` and ``label`` columns.

``GraphParser.parse()`` auto-detects the format from the header set and
dispatches to the matching builder.
"""

from dataclasses import dataclass, field
from .node_registry import NodeTypeRegistry


@dataclass
class ParsedNode:
    """One parsed node before persistence.

    Attributes:
        node_id (str): unique identifier used to deduplicate within the parse pass.
        label (str): human-readable label.
        node_type (str): one of the types in ``NodeTypeRegistry`` (or ``'unknown'``).
        metadata (dict): format-specific extras (job_type, nom_sql, paths, ...).
    """
    node_id:   str
    label:     str
    node_type: str
    metadata:  dict = field(default_factory=dict)


@dataclass
class ParsedEdge:
    """One directed dependency edge between two parsed nodes.

    Attributes:
        source_id (str): id of the source node.
        target_id (str): id of the target node.
        action (str | None): semantic verb (``read`` / ``write`` / ``calls`` /
            ``triggers``) or None when not specified.
    """
    source_id: str
    target_id: str
    action:    str | None


@dataclass
class CatalogParseResult:
    """Return value of ``GraphParser.parse``.

    Attributes:
        nodes (list[ParsedNode]): the parsed nodes (already deduplicated by id).
        edges (list[ParsedEdge]): the parsed edges.
        warnings (list[str]): non-fatal issues callers may surface to the user.
        error (str | None): fatal error message; when set, ``nodes`` / ``edges``
            should be considered invalid.
    """
    nodes:    list[ParsedNode] = field(default_factory=list)
    edges:    list[ParsedEdge] = field(default_factory=list)
    warnings: list[str]        = field(default_factory=list)
    error:    str | None       = None


class GraphParser:
    """Parses a client Excel file into ParsedNode/ParsedEdge lists.

    The column-name candidates live in ``ColConfig``; update there when the
    real Excel format is confirmed without touching any other logic. Each Excel
    row in the long format represents one directed edge:

        id  ──[action]──►  dependency_type

    A node may appear in multiple rows (one row per action it performs).
    """

    class ColConfig:
        """Logical-field-to-column-name lookups for the long-format parser.

        Each tuple lists candidate header names in priority order; the first
        match wins. Update this when a new client uses different column names.
        """
        ID:         tuple[str, ...] = ('id', 'action_id', 'node_id', 'source')
        TYPE:       tuple[str, ...] = ('type', 'node_type', 'action_type')
        ACTION:     tuple[str, ...] = ('action', 'verb', 'operation')
        DEPENDENCY: tuple[str, ...] = ('dependency_type', 'dependency', 'target', 'target_id')
        LABEL:      tuple[str, ...] = ('label', 'name', 'display_name', 'description')

    META_COLUMNS: tuple[str, ...] = (
        'nom_sql', 'job_type', 'fichier_xml', 'path_xml', 'path', 'cte', 'description', 'param',
    )

    def __init__(self, file_obj) -> None:
        """Store the uploaded file and prepare empty parse-state slots.

        Args:
            file_obj: a file-like object accepted by ``openpyxl.load_workbook``.
        """
        self._file                                  = file_obj
        self._headers:  list[str]                   = []
        self._col_idx:  dict[str, int]              = {}
        self._data:     list[tuple]                 = []
        self._nodes:    dict[str, ParsedNode]       = {}
        self._edges:    list[ParsedEdge]            = []
        self._warnings: list[str]                   = []

    def parse(self) -> CatalogParseResult:
        """Read the source file and dispatch to the matching builder.

        Detection rules (first match wins):
            wide DataCatalyst  : has ``nom_collection`` + (``bdd_entree`` or ``nom_sql``)
            ODI scenario       : has ``interface`` + ``table`` + ``sens``
            long legacy        : default fallback

        Returns:
            CatalogParseResult: either populated nodes/edges/warnings on
            success, or an ``error``-only result when the file is invalid.
        """
        error = self._load_rows()
        if error:
            return CatalogParseResult(error=error)

        if 'nom_collection' in self._col_idx and ('bdd_entree' in self._col_idx or 'nom_sql' in self._col_idx):
            self._build_wide_format()
        elif {'interface', 'table', 'sens'}.issubset(self._col_idx.keys()):
            self._build_odi_format()
        else:
            self._build_nodes()
            self._build_edges()

        return CatalogParseResult(
            nodes    = list(self._nodes.values()),
            edges    = self._edges,
            warnings = self._warnings,
        )

    def _load_rows(self) -> str | None:
        """Dispatch to the Excel or CSV reader based on the uploaded file's name.

        Returns:
            str | None: a user-facing French error string when the file can't
            be read or is empty, else None.
        """
        name = (getattr(self._file, 'name', '') or '').lower()
        if name.endswith('.csv'):
            return self._load_csv()
        return self._load_workbook()

    def _ingest_header_row(self, raw_row: tuple, empty_msg: str) -> str | None:
        """Populate ``_headers`` + ``_col_idx`` from the first row and store the rest as data.

        Args:
            raw_row (tuple): the full list of rows including the header.
            empty_msg (str): error to return when the file has no rows.

        Returns:
            str | None: the empty-file error or None on success.
        """
        if not raw_row:
            return empty_msg
        self._headers = [
            str(h).strip().lower() if h is not None else ''
            for h in raw_row[0]
        ]
        self._col_idx = {h: i for i, h in enumerate(self._headers) if h}
        self._data    = list(raw_row[1:])
        return None

    def _load_workbook(self) -> str | None:
        """Open an Excel workbook and capture its headers + data rows.

        Returns:
            str | None: a user-facing French error string when the file can't
            be read or is empty, else None.
        """
        try:
            import openpyxl
            wb   = openpyxl.load_workbook(self._file, read_only=True, data_only=True)
            ws   = wb.active
            rows = list(ws.values)
            wb.close()
        except Exception as e:
            return f"Impossible de lire le fichier Excel : {e}"

        return self._ingest_header_row(rows, "Fichier Excel vide.")

    def _load_csv(self) -> str | None:
        """Read a CSV file with auto-detected separator and capture headers + data rows.

        The separator is sniffed from the first 4 KB of the file (handles ``,``
        and ``;`` as well as more exotic dialects). The file pointer is reset
        before the actual parse pass so no bytes are dropped.

        Returns:
            str | None: a user-facing French error string when the file can't
            be read or is empty, else None.
        """
        import csv, io

        try:
            raw = self._file.read()
            if isinstance(raw, bytes):
                text = raw.decode('utf-8-sig', errors='replace')
            else:
                text = raw
        except Exception as e:
            return f"Impossible de lire le fichier CSV : {e}"

        if not text.strip():
            return "Fichier CSV vide."

        sample = text[:4096]
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=',;\t|')
        except csv.Error:
            dialect = csv.excel

        reader = csv.reader(io.StringIO(text), dialect)
        rows   = [tuple(r) for r in reader if any((cell or '').strip() for cell in r)]
        return self._ingest_header_row(rows, "Fichier CSV vide.")

    def _resolve_col(self, candidates: tuple[str, ...]) -> str | None:
        """Return the first candidate column name that exists in the loaded headers.

        Args:
            candidates (tuple[str, ...]): names to try in priority order.

        Returns:
            str | None: the matching header, or None when none of the candidates exist.
        """
        for name in candidates:
            if name in self._col_idx:
                return name
        return None

    def _cell(self, row: tuple, col_name: str | None) -> str | None:
        """Read a stripped cell value, returning None for missing or empty cells.

        Args:
            row (tuple): the row tuple yielded by openpyxl.
            col_name (str | None): the resolved column name, or None.

        Returns:
            str | None: the cleaned cell string, or None for missing/blank cells.
        """
        if col_name is None or col_name not in self._col_idx:
            return None
        val = row[self._col_idx[col_name]]
        if val is None:
            return None
        s = str(val).strip()
        return s if s else None

    @staticmethod
    def _label_from_id(node_id: str) -> str:
        """Derive a readable label by stripping the type prefix and cleaning underscores.

        Args:
            node_id (str): the raw id (e.g. ``compute_pnl``).

        Returns:
            str: a friendlier label (e.g. ``pnl``); falls back to ``node_id``
            with underscores replaced by spaces when no prefix matches.
        """
        lower = node_id.lower()
        for prefix in sorted(NodeTypeRegistry.PREFIX_MAP.keys(), key=len, reverse=True):
            if lower.startswith(prefix):
                return node_id[len(prefix):].replace('_', ' ').strip() or node_id
        return node_id.replace('_', ' ')

    def _upsert_node(
        self,
        node_id:   str,
        node_type: str | None = None,
        label:     str | None = None,
    ) -> None:
        """Add a node if absent, or upgrade its type when we now have better info.

        An existing node's type is overwritten only when it was ``'unknown'``;
        labels and metadata of existing nodes are never modified by this helper.

        Args:
            node_id (str): the node id to upsert.
            node_type (str | None): explicit type if known, else inferred from prefix.
            label (str | None): explicit label if known, else derived from the id.
        """
        if not node_id:
            return
        if node_id in self._nodes:
            existing = self._nodes[node_id]
            if node_type and existing.node_type == 'unknown':
                self._nodes[node_id] = ParsedNode(
                    node_id   = node_id,
                    label     = existing.label,
                    node_type = node_type,
                )
            return

        resolved_type  = node_type or NodeTypeRegistry.infer_type(node_id)
        resolved_label = label or self._label_from_id(node_id)
        self._nodes[node_id] = ParsedNode(
            node_id   = node_id,
            label     = resolved_label,
            node_type = resolved_type,
        )

    def _build_nodes(self) -> None:
        """Long-format pass 1: scan every row and upsert source + dependency nodes."""
        cc        = self.ColConfig
        id_col    = self._resolve_col(cc.ID)
        type_col  = self._resolve_col(cc.TYPE)
        label_col = self._resolve_col(cc.LABEL)
        dep_col   = self._resolve_col(cc.DEPENDENCY)

        if not id_col:
            self._warnings.append("Colonne ID introuvable — les noeuds source seront ignores.")

        for row in self._data:
            node_id   = self._cell(row, id_col)
            node_type = self._cell(row, type_col)
            label     = self._cell(row, label_col)
            dep_id    = self._cell(row, dep_col)

            if node_type:
                node_type = node_type.lower()

            if node_id:
                self._upsert_node(node_id, node_type, label)
            if dep_id:
                self._upsert_node(dep_id)

    def _build_edges(self) -> None:
        """Long-format pass 2: emit one ParsedEdge per unique (source, target, action) triple."""
        cc         = self.ColConfig
        id_col     = self._resolve_col(cc.ID)
        action_col = self._resolve_col(cc.ACTION)
        dep_col    = self._resolve_col(cc.DEPENDENCY)

        if not id_col or not dep_col:
            self._warnings.append("Colonnes ID ou DEPENDENCY introuvables — les edges seront ignores.")
            return

        seen: set[tuple] = set()
        for row in self._data:
            source_id = self._cell(row, id_col)
            target_id = self._cell(row, dep_col)
            action    = self._cell(row, action_col)

            if not source_id or not target_id:
                continue
            if action:
                action = action.lower()

            key = (source_id, target_id, action)
            if key in seen:
                continue
            seen.add(key)

            self._edges.append(ParsedEdge(
                source_id = source_id,
                target_id = target_id,
                action    = action,
            ))

    def _build_wide_format(self) -> None:
        """Wide-format entry point: one row = one collection with list-based I/O.

        Columns used:

            bdd_entree   — semicolon-separated list of input database names
            table_entree — semicolon-separated list of input table names (same order)
            bdd_sortie   — output system name (edd, edeal19, dmcg, ods, ...)
            table_sortie — output table name (optional)

        Graph built per row::

            [bdd.table] ──read──► [collection] ──write──► [bdd_sortie]
            [feature] ──calls──► [component] ──calls──► [collection]
        """
        seen_edges: set[tuple] = set()
        for row in self._data:
            self._ingest_wide_row(row, seen_edges)

    def _ingest_wide_row(self, row: tuple, seen_edges: set[tuple]) -> None:
        """Materialise one wide-format row into hierarchy + collection + I/O edges.

        Args:
            row (tuple): the raw row tuple from openpyxl.
            seen_edges (set[tuple]): dedup set used by ``_add_edge_once``.
        """
        collection_id = self._cell(row, 'nom_collection')
        if not collection_id:
            return

        feature_name   = self._cell(row, 'nom_dossier_feature')
        component_name = self._cell(row, 'nom_dossier_component')
        component_id   = self._component_id(feature_name, component_name)

        self._ensure_feature_node(feature_name)
        self._ensure_component_node(component_id, component_name, feature_name)
        self._link_hierarchy(feature_name, component_id, collection_id, seen_edges)

        self._upsert_wide_collection(row, collection_id)
        self._ingest_wide_inputs(row, collection_id, seen_edges)
        self._ingest_wide_output(row, collection_id, seen_edges)

    def _component_id(self, feature_name: str | None, component_name: str | None) -> str | None:
        """Compose the unique component id, namespaced by feature when both are present.

        Args:
            feature_name (str | None): parent feature name.
            component_name (str | None): component name within the feature.

        Returns:
            str | None: ``"<feature>/<component>"`` when both exist, else
            ``component_name``, else None.
        """
        if feature_name and component_name:
            return f'{feature_name}/{component_name}'
        return component_name

    def _ensure_feature_node(self, feature_name: str | None) -> None:
        """Create the feature node when missing (no-op when already present or name empty).

        Args:
            feature_name (str | None): the feature name to upsert.
        """
        if not feature_name or feature_name in self._nodes:
            return
        self._nodes[feature_name] = ParsedNode(
            node_id   = feature_name,
            label     = feature_name,
            node_type = 'feature',
        )

    def _ensure_component_node(
        self,
        component_id:   str | None,
        component_name: str | None,
        feature_name:   str | None,
    ) -> None:
        """Create the component node when missing, tagging its parent feature in metadata.

        Args:
            component_id (str | None): unique component id (feature-namespaced).
            component_name (str | None): display name for the component.
            feature_name (str | None): parent feature name, stored in metadata when present.
        """
        if not component_id or component_id in self._nodes:
            return
        self._nodes[component_id] = ParsedNode(
            node_id   = component_id,
            label     = component_name or component_id,
            node_type = 'component',
            metadata  = {'feature': feature_name} if feature_name else {},
        )

    def _link_hierarchy(
        self,
        feature_name:  str | None,
        component_id:  str | None,
        collection_id: str,
        seen_edges:    set[tuple],
    ) -> None:
        """Add feature -> component and component -> collection ``calls`` edges (dedup-safe).

        Args:
            feature_name (str | None): the feature side of the hierarchy.
            component_id (str | None): the component side.
            collection_id (str): the collection that the component contains.
            seen_edges (set[tuple]): dedup set shared with the rest of the parse.
        """
        if feature_name and component_id:
            self._add_edge_once(feature_name, component_id, 'calls', seen_edges)
        if component_id:
            self._add_edge_once(component_id, collection_id, 'calls', seen_edges)

    def _upsert_wide_collection(self, row: tuple, collection_id: str) -> None:
        """Create (or overwrite) the collection node, harvesting metadata from the row.

        Args:
            row (tuple): the wide-format row.
            collection_id (str): the id under which the node is registered.
        """
        meta = {k: self._cell(row, k) for k in self.META_COLUMNS if self._cell(row, k)}
        self._nodes[collection_id] = ParsedNode(
            node_id   = collection_id,
            label     = collection_id,
            node_type = 'collection',
            metadata  = meta,
        )

    def _ingest_wide_inputs(self, row: tuple, collection_id: str, seen_edges: set[tuple]) -> None:
        """Emit input table nodes and ``read`` edges from the paired list columns.

        Args:
            row (tuple): the wide-format row.
            collection_id (str): the collection reading these inputs.
            seen_edges (set[tuple]): dedup set used by ``_add_edge_once``.
        """
        bdd_list   = (self._cell(row, 'bdd_entree')   or '').split(';')
        table_list = (self._cell(row, 'table_entree') or '').split(';')
        for bdd, table in zip(bdd_list, table_list):
            bdd, table = bdd.strip(), table.strip()
            if not bdd or not table:
                continue
            table_id   = f'{bdd}.{table}'
            input_type = 'datalake' if bdd.upper().startswith('DL_') else 'datawarehouse'
            if table_id not in self._nodes:
                self._nodes[table_id] = ParsedNode(
                    node_id   = table_id,
                    label     = table,
                    node_type = input_type,
                    metadata  = {'bdd': bdd},
                )
            self._add_edge_once(table_id, collection_id, 'read', seen_edges)

    def _ingest_wide_output(self, row: tuple, collection_id: str, seen_edges: set[tuple]) -> None:
        """Emit the destination warehouse(s) and a ``write`` edge from the collection.

        Args:
            row (tuple): the wide-format row.
            collection_id (str): the collection producing the output.
            seen_edges (set[tuple]): dedup set used by ``_add_edge_once``.
        """
        bdd_sortie = self._cell(row, 'bdd_sortie')
        if not bdd_sortie:
            return
        table_sortie = self._cell(row, 'table_sortie')

        self._ensure_warehouse_node(bdd_sortie, bdd_sortie.upper())
        if table_sortie:
            output_id = f'{bdd_sortie}.{table_sortie}'
            self._ensure_warehouse_node(output_id, table_sortie, parent_bdd=bdd_sortie)
            target_id = output_id
        else:
            target_id = bdd_sortie

        self._add_edge_once(collection_id, target_id, 'write', seen_edges)

    def _ensure_warehouse_node(self, node_id: str, label: str, parent_bdd: str | None = None) -> None:
        """Create a datawarehouse node when absent, storing its parent system in metadata.

        Args:
            node_id (str): the warehouse-table id (either ``"<bdd>"`` or ``"<bdd>.<table>"``).
            label (str): display label.
            parent_bdd (str | None): the owning warehouse system; recorded in
                metadata only when the node represents a sub-table.
        """
        if node_id in self._nodes:
            return
        self._nodes[node_id] = ParsedNode(
            node_id   = node_id,
            label     = label,
            node_type = 'datawarehouse',
            metadata  = {'bdd': parent_bdd} if parent_bdd else {},
        )

    def _add_edge_once(self, source: str, target: str, action: str, seen: set[tuple]) -> None:
        """Append a ParsedEdge only if ``(source, target, action)`` hasn't been emitted yet.

        Args:
            source (str): id of the source node.
            target (str): id of the target node.
            action (str): the verb (``read`` / ``write`` / ``calls`` / ``triggers``).
            seen (set[tuple]): dedup set shared across the wide-format pass.
        """
        key = (source, target, action)
        if key in seen:
            return
        seen.add(key)
        self._edges.append(ParsedEdge(source_id=source, target_id=target, action=action))

    ODI_SENS_INPUT:  frozenset[str] = frozenset({'in'})
    ODI_SENS_OUTPUT: frozenset[str] = frozenset({'out', 'in/out', 'inout', 'in_out'})

    def _build_odi_format(self) -> None:
        """ODI export builder: one row = one (scenario, table, sens) tuple.

        Each ``interface`` becomes an ``odi_mapping`` node. Rows with
        ``sens=in`` produce ``table -> scenario`` (read) edges; rows with
        ``sens=in/out`` (or ``out``) produce ``scenario -> table`` (write)
        edges. The output table is also tagged ``odi`` in
        ``metadata.sources`` so it can be cross-referenced with DataCatalyst
        imports of the same warehouse.
        """
        seen_edges: set[tuple] = set()
        grouped:   dict[str, list[tuple]] = self._group_odi_rows_by_interface()
        for interface_name, rows in grouped.items():
            self._ingest_odi_scenario(interface_name, rows, seen_edges)

    def _group_odi_rows_by_interface(self) -> dict[str, list[tuple]]:
        """Bucket every CSV row by its ``interface`` value, dropping blank-interface rows.

        Returns:
            dict[str, list[tuple]]: ``{interface_name: [row, row, ...]}``.
        """
        grouped: dict[str, list[tuple]] = {}
        for row in self._data:
            name = self._cell(row, 'interface')
            if not name:
                continue
            grouped.setdefault(name, []).append(row)
        return grouped

    def _ingest_odi_scenario(self, interface_name: str, rows: list[tuple], seen_edges: set[tuple]) -> None:
        """Materialise one scenario as an odi_mapping node plus its read/write edges.

        Args:
            interface_name (str): the scenario id (taken verbatim as ``node_id``).
            rows (list[tuple]): every CSV row carrying this ``interface`` value.
            seen_edges (set[tuple]): dedup set used by ``_add_edge_once``.
        """
        scenario_meta = self._build_odi_scenario_metadata(rows)
        self._upsert_odi_scenario_node(interface_name, scenario_meta)

        for row in rows:
            table_id = self._cell(row, 'table')
            sens     = (self._cell(row, 'sens') or '').lower().strip()
            if not table_id or not sens:
                continue
            self._ensure_odi_table_node(table_id)
            self._link_odi_row(interface_name, table_id, sens, seen_edges)

    def _build_odi_scenario_metadata(self, rows: list[tuple]) -> dict:
        """Collect per-table Itable/IsourceTab refs and stash them on the scenario node.

        The exact meaning of these integer codes is unknown today, but they
        come from the source SQL query and may carry useful debug info later.

        Args:
            rows (list[tuple]): every row of a single scenario.

        Returns:
            dict: ``{'source': 'odi', 'rows': [{table, sens, Itable?, IsourceTab?}, ...]}``.
        """
        compact_rows: list[dict] = []
        for row in rows:
            table = self._cell(row, 'table')
            if not table:
                continue
            entry: dict = {
                'table': table,
                'sens':  (self._cell(row, 'sens') or '').lower().strip() or None,
            }
            itable = self._cell(row, 'itable')
            isrc   = self._cell(row, 'isourcetab')
            if itable: entry['Itable']     = itable
            if isrc:   entry['IsourceTab'] = isrc
            compact_rows.append(entry)
        return {'source': 'odi', 'rows': compact_rows}

    def _upsert_odi_scenario_node(self, interface_name: str, metadata: dict) -> None:
        """Create the scenario node fresh, or merge ODI metadata into an existing one.

        Args:
            interface_name (str): the scenario id and label.
            metadata (dict): the ODI-specific metadata to attach.
        """
        existing = self._nodes.get(interface_name)
        if existing is None:
            self._nodes[interface_name] = ParsedNode(
                node_id   = interface_name,
                label     = interface_name,
                node_type = 'odi_mapping',
                metadata  = metadata,
            )
            return
        merged = {**existing.metadata, **metadata}
        self._nodes[interface_name] = ParsedNode(
            node_id   = interface_name,
            label     = existing.label or interface_name,
            node_type = 'odi_mapping' if existing.node_type == 'unknown' else existing.node_type,
            metadata  = merged,
        )

    def _ensure_odi_table_node(self, table_id: str) -> None:
        """Create a datawarehouse node for the table, or just tag an existing one with ``odi``.

        When ``table_id`` matches a node already imported by DataCatalyst (same
        fully-qualified id), we append ``'odi'`` to ``metadata.sources`` so the
        two origins can be tracked without losing the original info.

        Args:
            table_id (str): the (presumably qualified) table identifier from the CSV.
        """
        existing = self._nodes.get(table_id)
        if existing is None:
            self._nodes[table_id] = ParsedNode(
                node_id   = table_id,
                label     = table_id.split('.')[-1] or table_id,
                node_type = 'datawarehouse',
                metadata  = {'sources': ['odi']},
            )
            return
        sources = list(existing.metadata.get('sources', []))
        if 'odi' not in sources:
            sources.append('odi')
        existing.metadata['sources'] = sources

    def _link_odi_row(self, interface_name: str, table_id: str, sens: str, seen_edges: set[tuple]) -> None:
        """Emit the read/write edge implied by a single ODI row, or skip on unknown sens.

        Args:
            interface_name (str): the scenario node id.
            table_id (str): the table node id.
            sens (str): already lowercased / stripped sens value.
            seen_edges (set[tuple]): dedup set for ``_add_edge_once``.
        """
        if sens in self.ODI_SENS_INPUT:
            self._add_edge_once(table_id, interface_name, 'read', seen_edges)
        elif sens in self.ODI_SENS_OUTPUT:
            self._add_edge_once(interface_name, table_id, 'write', seen_edges)
        else:
            self._warnings.append(f"ODI: valeur 'sens' inconnue ignorée — '{sens}' (table {table_id})")
