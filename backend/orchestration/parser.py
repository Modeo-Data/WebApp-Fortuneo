# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  ORCHESTRATION — EN ATTENTE DES VRAIES DONNÉES ODI                         ║
# ║  Pour activer : décommenter ce fichier + settings.py + urls.py             ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

# """
# Two-sheet Excel parser for orchestration graphs (ODI, shell pipelines, etc.)
#
# Expected format
# ───────────────
# Sheet "nodes"   → id | label | type | group
# Sheet "edges"   → source | target | action
#
# Both sheets are detected by name (case-insensitive, several aliases supported).
# Any column not listed above is silently ignored.
# """
# from dataclasses import dataclass, field
#
#
# _NODES_SHEET_ALIASES = {'nodes', 'noeuds', 'nœuds', 'node'}
# _EDGES_SHEET_ALIASES = {'edges', 'liens', 'relations', 'edge', 'dependencies', 'deps'}
#
#
# @dataclass
# class ParsedNode:
#     node_id: str
#     label:   str
#     type:    str
#     group:   str | None = None
#
#
# @dataclass
# class ParsedEdge:
#     source_id: str
#     target_id: str
#     action:    str | None
#
#
# @dataclass
# class OrchestraParseResult:
#     nodes:    list[ParsedNode] = field(default_factory=list)
#     edges:    list[ParsedEdge] = field(default_factory=list)
#     warnings: list[str]        = field(default_factory=list)
#     error:    str | None       = None
#
#
# # ── Helpers ───────────────────────────────────────────────────────────────────
#
# def _col_idx(ws) -> dict[str, int]:
#     """Return {header_lower: column_index} from a worksheet's first row."""
#     first = list(ws.values)[0] if ws.max_row else []
#     return {str(h).strip().lower(): i for i, h in enumerate(first) if h is not None}
#
# def _cell(row: tuple, idx: dict, *candidates: str) -> str | None:
#     for name in candidates:
#         if name in idx:
#             val = row[idx[name]]
#             s = str(val).strip() if val is not None else ''
#             if s:
#                 return s
#     return None
#
# def _find_sheet(wb, aliases: set) -> object | None:
#     for name in wb.sheetnames:
#         if name.strip().lower() in aliases:
#             return wb[name]
#     return None
#
#
# # ── Parser ────────────────────────────────────────────────────────────────────
#
# class OrchestraParser:
#     """Parses a two-sheet Excel file into orchestration nodes and edges."""
#
#     def __init__(self, file_obj):
#         self._file = file_obj
#
#     def parse(self) -> OrchestraParseResult:
#         try:
#             import openpyxl
#             wb = openpyxl.load_workbook(self._file, read_only=True, data_only=True)
#         except Exception as e:
#             return OrchestraParseResult(error=f"Impossible de lire le fichier Excel : {e}")
#
#         nodes_ws = _find_sheet(wb, _NODES_SHEET_ALIASES)
#         edges_ws = _find_sheet(wb, _EDGES_SHEET_ALIASES)
#
#         if not nodes_ws:
#             wb.close()
#             return OrchestraParseResult(error="Onglet 'nodes' introuvable. Nommez votre onglet 'nodes' ou 'noeuds'.")
#         if not edges_ws:
#             wb.close()
#             return OrchestraParseResult(error="Onglet 'edges' introuvable. Nommez votre onglet 'edges' ou 'liens'.")
#
#         warnings: list[str] = []
#         nodes = self._parse_nodes(nodes_ws, warnings)
#         edges = self._parse_edges(edges_ws, nodes, warnings)
#
#         wb.close()
#         return OrchestraParseResult(nodes=list(nodes.values()), edges=edges, warnings=warnings)
#
#     def _parse_nodes(self, ws, warnings: list) -> dict[str, ParsedNode]:
#         rows = list(ws.values)
#         if len(rows) < 2:
#             warnings.append("Onglet nodes vide.")
#             return {}
#
#         idx = _col_idx(ws)
#         nodes: dict[str, ParsedNode] = {}
#
#         for row in rows[1:]:
#             node_id = _cell(row, idx, 'id', 'node_id')
#             if not node_id:
#                 continue
#             label = _cell(row, idx, 'label', 'name', 'display_name') or node_id
#             typ   = (_cell(row, idx, 'type', 'node_type') or 'unknown').lower()
#             group = _cell(row, idx, 'group', 'groupe', 'section', 'domain', 'domaine')
#             nodes[node_id] = ParsedNode(node_id=node_id, label=label, type=typ, group=group)
#
#         return nodes
#
#     def _parse_edges(self, ws, nodes: dict, warnings: list) -> list[ParsedEdge]:
#         rows = list(ws.values)
#         if len(rows) < 2:
#             warnings.append("Onglet edges vide.")
#             return []
#
#         idx = _col_idx(ws)
#         edges: list[ParsedEdge] = []
#         seen: set[tuple] = set()
#
#         for row in rows[1:]:
#             source_id = _cell(row, idx, 'source', 'source_id', 'from')
#             target_id = _cell(row, idx, 'target', 'target_id', 'dependency_type', 'to')
#             action    = _cell(row, idx, 'action', 'verb', 'operation')
#
#             if not source_id or not target_id:
#                 continue
#
#             for nid in (source_id, target_id):
#                 if nid not in nodes:
#                     nodes[nid] = ParsedNode(node_id=nid, label=nid, type='unknown')
#
#             if action:
#                 action = action.lower()
#
#             key = (source_id, target_id, action)
#             if key not in seen:
#                 seen.add(key)
#                 edges.append(ParsedEdge(source_id=source_id, target_id=target_id, action=action))
#
#         return edges
