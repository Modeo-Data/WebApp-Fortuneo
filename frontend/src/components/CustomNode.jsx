import { Handle, Position } from '@xyflow/react'
import {
  Database, GitMerge, LayoutDashboard, GitBranch,
  Cpu, Layers, ArrowUpFromLine, Box, HardDrive,
} from 'lucide-react'
import { getNodeColor, getNodeLabel } from '../lib/nodeTypes.js'

// Icons per type — extend here when new types arrive
const TYPE_ICONS = {
  source:        Database,
  feature:       Layers,
  component:     Box,
  ingest:        HardDrive,
  compute:       Cpu,
  virtual:       GitMerge,
  extract:       ArrowUpFromLine,
  transformation:GitMerge,
  use_case:      LayoutDashboard,
}

const FALLBACK_ICON = GitBranch

const JOB_TYPE_COLOR = {
  extract:  '#2563eb',
  virtual:  '#8b5cf6',
  ingest:   '#d97706',
  compute:  '#16a34a',
}

export default function CustomNode({ data, selected }) {
  const { type, stage, sheet, label, metadata,
          dimmed, highlighted, isActive, insightTarget,
          upstreamCount = 0, downstreamCount = 0,
          diffStatus } = data

  const jobType = type === 'collection' ? (metadata?.job_type ?? null) : null

  const accent    = getNodeColor(type)
  const typeLabel = getNodeLabel(type)
  const Icon      = TYPE_ICONS[type] ?? FALLBACK_ICON

  const diffBorderColor = diffStatus === 'added'   ? '#16a34a'
                        : diffStatus === 'changed' ? '#d97706'
                        : null

  const glowStyle = insightTarget
    ? `0 0 0 2px white, 0 0 0 4px ${accent}, 0 0 12px ${accent}55`
    : diffStatus === 'added'
    ? `0 0 0 2px white, 0 0 0 4px #16a34a`
    : diffStatus === 'changed'
    ? `0 0 0 2px white, 0 0 0 4px #d97706`
    : selected
    ? `0 0 0 2px white, 0 0 0 2px #88c648`
    : '0 1px 4px rgba(0,0,0,0.08)'

  return (
    <div style={{
      opacity:    dimmed ? 0.30 : 1,
      transform:  isActive ? 'scale(1.06)' : highlighted ? 'scale(1.03)' : 'scale(1)',
      boxShadow:  dimmed ? 'var(--dimmed-node-glow)' : glowStyle,
      background: 'var(--node-bg)',
      position:   'relative',
      transition: 'opacity 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease',
      minWidth:   200,
      maxWidth:   240,
      borderRadius: 10,
      border:     (highlighted || isActive || insightTarget)
        ? `2px solid ${accent}`
        : `1px solid var(--node-border)`,
      borderLeft: (highlighted || isActive || insightTarget)
        ? `2px solid ${accent}`
        : `3px solid ${diffBorderColor ?? accent}`,
      cursor: 'pointer',
    }}>

      <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 8, height: 8, left: -1 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 8, height: 8, right: -1 }} />

      <div style={{ padding: '10px 12px 8px 12px' }}>
        {/* Icon badge + sheet */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 22, height: 22, borderRadius: 6, flexShrink: 0,
              background: diffBorderColor ?? accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={12} color="white" />
            </div>
            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: accent }}>
              {stage ?? typeLabel}
            </span>
          </div>
          {jobType && (
            <span style={{
              fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
              color: JOB_TYPE_COLOR[jobType] ?? '#64748b',
              background: `${JOB_TYPE_COLOR[jobType] ?? '#64748b'}18`,
              padding: '1px 5px', borderRadius: 4, whiteSpace: 'nowrap',
            }}>
              {jobType}
            </span>
          )}
          {!jobType && sheet && (
            <span style={{
              fontSize: 9, color: 'var(--node-sheet-color)', fontFamily: 'monospace',
              background: 'var(--node-sheet-bg)', padding: '1px 5px', borderRadius: 4,
              maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {sheet}
            </span>
          )}
        </div>

        {/* Label */}
        <p style={{
          fontSize: 13, fontWeight: 600, color: 'var(--node-label-color)',
          lineHeight: 1.3, marginBottom: 8,
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {label}
        </p>

        {/* Counts */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          borderTop: '1px solid var(--node-divider)', paddingTop: 6,
        }}>
          <span style={{ fontSize: 10, color: 'var(--node-count-color)', display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ color: 'var(--node-arrow-color)' }}>↑</span> {upstreamCount} in
          </span>
          <span style={{ color: 'var(--node-dot-color)' }}>·</span>
          <span style={{ fontSize: 10, color: 'var(--node-count-color)', display: 'flex', alignItems: 'center', gap: 3 }}>
            {downstreamCount} out <span style={{ color: 'var(--node-arrow-color)' }}>↓</span>
          </span>
        </div>
      </div>
    </div>
  )
}
