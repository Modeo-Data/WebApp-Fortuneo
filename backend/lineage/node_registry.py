from dataclasses import dataclass


@dataclass(frozen=True)
class NodeTypeDef:
    lane:         int
    color:        str
    display_name: str
    size:         str = 'normal'   # 'normal' | 'small'


class NodeTypeRegistry:
    """
    Central registry of all node types, their visual properties, and lane positions.
    To support a new type: add an entry to TYPES and optionally to PREFIX_MAP.
    """

    TYPES: dict[str, NodeTypeDef] = {
        # ── New model ────────────────────────────────────────────────────────
        'feature':       NodeTypeDef(lane=0, color='#88c648', display_name='Feature'),
        'component':     NodeTypeDef(lane=1, color='#8b5cf6', display_name='Component'),
        'ingest':        NodeTypeDef(lane=2, color='#2563eb', display_name='Ingest'),
        'datalake':      NodeTypeDef(lane=3, color='#64748b', display_name='Data Lake', size='small'),
        'datawarehouse': NodeTypeDef(lane=3, color='#475569', display_name='DWH',       size='small'),
        'compute':       NodeTypeDef(lane=4, color='#d97706', display_name='Compute'),
        'virtual':       NodeTypeDef(lane=5, color='#06b6d4', display_name='Virtual'),
        'extract':       NodeTypeDef(lane=6, color='#10b981', display_name='Extract'),
        # ── Legacy — kept for backwards compatibility with old sessions ───────
        'source':        NodeTypeDef(lane=0, color='#2563eb', display_name='Source'),
        'transformation':NodeTypeDef(lane=2, color='#d97706', display_name='Transformation'),
        'use_case':      NodeTypeDef(lane=7, color='#8b5cf6', display_name='Dashboard'),
    }

    # ID prefix → inferred type when the row's own type column is absent or empty
    PREFIX_MAP: dict[str, str] = {
        'feature_':       'feature',
        'component_':     'component',
        'ingest_':        'ingest',
        'compute_':       'compute',
        'virtual_':       'virtual',
        'extract_':       'extract',
        'datalake_':      'datalake',
        'dl_':            'datalake',
        'datawarehouse_': 'datawarehouse',
        'dwh_':           'datawarehouse',
        'dw_':            'datawarehouse',
        'source_':        'source',
        'use_case_':      'use_case',
    }

    KNOWN_ACTIONS: frozenset[str] = frozenset({'read', 'write', 'triggers'})

    @classmethod
    def infer_type(cls, node_id: str) -> str:
        """Infer node type from ID prefix. Returns 'unknown' if no prefix matches."""
        lower = node_id.lower()
        for prefix, node_type in cls.PREFIX_MAP.items():
            if lower.startswith(prefix):
                return node_type
        return 'unknown'

    @classmethod
    def get_def(cls, node_type: str) -> NodeTypeDef:
        """Return NodeTypeDef for a type, falling back to a generic def."""
        return cls.TYPES.get(
            node_type,
            NodeTypeDef(lane=99, color='#94a3b8', display_name=node_type.replace('_', ' ').title()),
        )

    @classmethod
    def is_known(cls, node_type: str) -> bool:
        return node_type in cls.TYPES

    @classmethod
    def sorted_types(cls) -> list[str]:
        """All type names sorted by lane number ascending."""
        return [t for t, _ in sorted(cls.TYPES.items(), key=lambda x: x[1].lane)]
