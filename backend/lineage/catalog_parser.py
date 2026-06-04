from dataclasses import dataclass, field
from .node_registry import NodeTypeRegistry


@dataclass
class ParsedNode:
    node_id:   str
    label:     str
    node_type: str


@dataclass
class ParsedEdge:
    source_id: str
    target_id: str
    action:    str | None


@dataclass
class CatalogParseResult:
    nodes:    list[ParsedNode]          = field(default_factory=list)
    edges:    list[ParsedEdge]          = field(default_factory=list)
    warnings: list[str]                 = field(default_factory=list)
    error:    str | None                = None


class GraphParser:
    """
    Parses the client's Excel transformation file into nodes and edges
    for storage in the catalog DB.

    Column names are centralised in ColConfig — update there when the
    real Excel format is confirmed without touching any other logic.

    Each Excel row represents one directed edge:
        id  ──[action]──►  dependency_type
    A node may appear in multiple rows (one row per action it performs).
    """

    class ColConfig:
        """Maps logical fields to candidate Excel column names (checked in order)."""
        ID         = ('id', 'action_id', 'node_id', 'source')
        TYPE       = ('type', 'node_type', 'action_type')
        ACTION     = ('action', 'verb', 'operation')
        DEPENDENCY = ('dependency_type', 'dependency', 'target', 'target_id')
        LABEL      = ('label', 'name', 'display_name', 'description')

    # ── Construction ─────────────────────────────────────────────────────────

    def __init__(self, file_obj):
        self._file    = file_obj
        self._headers: list[str]           = []
        self._col_idx: dict[str, int]      = {}
        self._data:    list[tuple]         = []
        self._nodes:   dict[str, ParsedNode] = {}
        self._edges:   list[ParsedEdge]    = []
        self._warnings: list[str]          = []

    # ── Public API ────────────────────────────────────────────────────────────

    def parse(self) -> CatalogParseResult:
        error = self._load_workbook()
        if error:
            return CatalogParseResult(error=error)
        self._build_nodes()
        self._build_edges()
        return CatalogParseResult(
            nodes=list(self._nodes.values()),
            edges=self._edges,
            warnings=self._warnings,
        )

    # ── Private: loading ──────────────────────────────────────────────────────

    def _load_workbook(self) -> str | None:
        try:
            import openpyxl
            wb = openpyxl.load_workbook(self._file, read_only=True, data_only=True)
            ws = wb.active
            rows = list(ws.values)
            wb.close()
        except Exception as e:
            return f"Impossible de lire le fichier Excel : {e}"

        if not rows:
            return "Fichier Excel vide."

        self._headers = [
            str(h).strip().lower() if h is not None else ''
            for h in rows[0]
        ]
        self._col_idx = {h: i for i, h in enumerate(self._headers) if h}
        self._data    = rows[1:]
        return None

    # ── Private: column resolution ────────────────────────────────────────────

    def _resolve_col(self, candidates: tuple[str, ...]) -> str | None:
        """Return the first candidate that exists as a column header."""
        for name in candidates:
            if name in self._col_idx:
                return name
        return None

    def _cell(self, row: tuple, col_name: str | None) -> str | None:
        if col_name is None or col_name not in self._col_idx:
            return None
        val = row[self._col_idx[col_name]]
        if val is None:
            return None
        s = str(val).strip()
        return s if s else None

    # ── Private: node helpers ────────────────────────────────────────────────

    @staticmethod
    def _label_from_id(node_id: str) -> str:
        """Derive a readable label by stripping the type prefix and cleaning underscores."""
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
        """Add node if absent; upgrade type/label if we now have better info."""
        if not node_id:
            return
        if node_id in self._nodes:
            existing = self._nodes[node_id]
            if node_type and existing.node_type == 'unknown':
                self._nodes[node_id] = ParsedNode(
                    node_id=node_id,
                    label=existing.label,
                    node_type=node_type,
                )
            return

        resolved_type  = node_type or NodeTypeRegistry.infer_type(node_id)
        resolved_label = label or self._label_from_id(node_id)
        self._nodes[node_id] = ParsedNode(
            node_id=node_id,
            label=resolved_label,
            node_type=resolved_type,
        )

    # ── Private: build passes ────────────────────────────────────────────────

    def _build_nodes(self) -> None:
        cc = self.ColConfig
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
                # Target nodes may not have their own row — infer type from prefix
                self._upsert_node(dep_id)

    def _build_edges(self) -> None:
        cc = self.ColConfig
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
                source_id=source_id,
                target_id=target_id,
                action=action,
            ))
