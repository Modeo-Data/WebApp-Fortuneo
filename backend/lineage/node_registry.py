"""Central registry of every node type known to the catalog.

A node type is identified by a lowercase string (``'feature'``, ``'compute'``,
...). Each entry in ``NodeTypeRegistry.TYPES`` carries its visual properties
(lane, color, display name, size). To add a new type, append one entry there
and optionally add a prefix mapping in ``PREFIX_MAP`` so ids that begin with
that prefix get the type inferred automatically.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class NodeTypeDef:
    """Visual + layout definition for one node type.

    Attributes:
        lane (int): horizontal lane index (lower = more upstream).
        color (str): hex string used for the node card accent.
        display_name (str): human-readable label shown in the UI.
        size (str): ``'normal'`` for full cards, ``'small'`` for storage chips.
    """
    lane:         int
    color:        str
    display_name: str
    size:         str = 'normal'


class NodeTypeRegistry:
    """Static registry of node types plus inference utilities.

    The registry is used by the parser (to infer types from id prefixes) and
    by the API serialisers (to look up display metadata). The frontend keeps
    a parallel copy in ``nodeTypes.js`` — both files must stay in sync when a
    new type is added.
    """

    TYPES: dict[str, NodeTypeDef] = {
        'feature':       NodeTypeDef(lane=0, color='#88c648', display_name='Feature'),
        'component':     NodeTypeDef(lane=1, color='#8b5cf6', display_name='Component'),
        'ingest':        NodeTypeDef(lane=2, color='#2563eb', display_name='Ingest'),
        'datalake':      NodeTypeDef(lane=3, color='#64748b', display_name='Data Lake', size='small'),
        'datawarehouse': NodeTypeDef(lane=3, color='#475569', display_name='DWH',       size='small'),
        'compute':       NodeTypeDef(lane=4, color='#d97706', display_name='Compute'),
        'virtual':       NodeTypeDef(lane=5, color='#06b6d4', display_name='Virtual'),
        'extract':       NodeTypeDef(lane=6, color='#10b981', display_name='Extract'),
        'odi_mapping':   NodeTypeDef(lane=7, color='#db2777', display_name='ODI Mapping'),
        'source':         NodeTypeDef(lane=0, color='#2563eb', display_name='Source'),
        'transformation': NodeTypeDef(lane=2, color='#d97706', display_name='Transformation'),
        'use_case':       NodeTypeDef(lane=8, color='#8b5cf6', display_name='Dashboard'),
    }

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
        """Guess a node's type by matching its id against ``PREFIX_MAP``.

        Args:
            node_id (str): the node id to inspect.

        Returns:
            str: the matching type from ``PREFIX_MAP``, or ``'unknown'`` when no prefix matches.
        """
        lower = node_id.lower()
        for prefix, node_type in cls.PREFIX_MAP.items():
            if lower.startswith(prefix):
                return node_type
        return 'unknown'

    @classmethod
    def get_def(cls, node_type: str) -> NodeTypeDef:
        """Return the NodeTypeDef for a type, falling back to a generic gray definition.

        Args:
            node_type (str): the type to resolve.

        Returns:
            NodeTypeDef: the registered definition, or a synthesized one with
            ``lane=99``, ``color='#94a3b8'`` and the type title-cased when unknown.
        """
        return cls.TYPES.get(
            node_type,
            NodeTypeDef(lane=99, color='#94a3b8', display_name=node_type.replace('_', ' ').title()),
        )

    @classmethod
    def is_known(cls, node_type: str) -> bool:
        """True when ``node_type`` has an explicit entry in the registry.

        Args:
            node_type (str): the type to test.

        Returns:
            bool: True when the type is in ``TYPES``.
        """
        return node_type in cls.TYPES

    @classmethod
    def sorted_types(cls) -> list[str]:
        """Return every registered type name ordered by lane ascending.

        Returns:
            list[str]: type names from upstream-most lane to downstream-most.
        """
        return [t for t, _ in sorted(cls.TYPES.items(), key=lambda x: x[1].lane)]
