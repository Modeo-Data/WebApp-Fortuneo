// ── Node type registry ────────────────────────────────────────────────────────
// Single source of truth for all node types: lane position, color, label, size.
// To add a new type: add one entry here — everything else derives from it.

import { Database, GitMerge, LayoutDashboard } from 'lucide-react'

export const NODE_TYPES = {
  // ── New model ──────────────────────────────────────────────────────────────
  feature:       { lane: 0, color: '#88c648', label: 'Feature',    size: 'normal' },
  component:     { lane: 1, color: '#8b5cf6', label: 'Component',  size: 'normal' },
  collection:    { lane: 2, color: '#d97706', label: 'Collection', size: 'normal' },
  ingest:        { lane: 2, color: '#2563eb', label: 'Ingest',     size: 'normal' },
  datalake:      { lane: 3, color: '#ec4899', label: 'Data Lake',       size: 'small'  },
  datawarehouse: { lane: 3, color: '#14b8a6', label: 'Data Warehouse',  size: 'small'  },
  compute:       { lane: 4, color: '#d97706', label: 'Compute',    size: 'normal' },
  virtual:       { lane: 5, color: '#06b6d4', label: 'Virtual',    size: 'normal' },
  extract:       { lane: 6, color: '#10b981', label: 'Extract',    size: 'normal' },
  // ── Legacy — kept for old sessions ────────────────────────────────────────
  source:        { lane: 0, color: '#2563eb', label: 'Source',        size: 'normal' },
  transformation:{ lane: 2, color: '#d97706', label: 'Transformation',size: 'normal' },
  use_case:      { lane: 7, color: '#8b5cf6', label: 'Dashboard',     size: 'normal' },
  // ── Internal ──────────────────────────────────────────────────────────────
  collapsed:     { lane: 99, color: '#94a3b8', label: 'Collapsed',    size: 'normal' },
}

// Lane order derived automatically — no manual maintenance needed
export const LANE_ORDER = Object.entries(NODE_TYPES)
  .sort(([, a], [, b]) => a.lane - b.lane)
  .map(([type]) => type)

export function getNodeColor(type) {
  return NODE_TYPES[type]?.color ?? '#94a3b8'
}

export function getNodeLabel(type) {
  return NODE_TYPES[type]?.label ?? (type ? type.replace('_', ' ') : 'Unknown')
}

export function isSmallNode(type) {
  return NODE_TYPES[type]?.size === 'small'
}

// ── TYPE_CFG: derived from NODE_TYPES, used by ExplorePanel / NodeItem / etc. ─
export const TYPE_CFG = Object.fromEntries(
  Object.entries(NODE_TYPES)
    .filter(([t]) => t !== 'collapsed')
    .map(([type, { color, label }]) => [type, {
      color,
      label,
      icon:     Database,
      bg:       `${color}18`,
      border:   `${color}55`,
      activeBg: `${color}22`,
    }])
)

// All displayable types in lane order (no collapsed)
export const ALL_TYPES = Object.keys(NODE_TYPES).filter(t => t !== 'collapsed')
