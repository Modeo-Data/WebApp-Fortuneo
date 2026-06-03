import { Handle, Position } from '@xyflow/react'
import { Database, GitMerge, LayoutDashboard } from 'lucide-react'

const TYPE_CONFIG = {
  source: {
    icon: Database, label: 'Source',
    accent: '#3B82F6', typeColor: '#2563EB',
    accentBg: 'var(--type-surface-source)',
  },
  transformation: {
    icon: GitMerge, label: 'Transformation',
    accent: '#D97706', typeColor: '#92400E',
    accentBg: 'var(--type-surface-transformation)',
  },
  use_case: {
    icon: LayoutDashboard, label: 'Use Case',
    accent: '#8B5CF6', typeColor: '#7C3AED',
    accentBg: 'var(--type-surface-use_case)',
  },
}

// dbt stage → visual override on transformation nodes
const STAGE_CFG = {
  staging: { accent: '#dc2626', typeColor: '#991b1b', label: 'Staging' },
  core:    { accent: '#ea580c', typeColor: '#9a3412', label: 'Core' },
  mart:    { accent: '#eab308', typeColor: '#854d0e', label: 'Mart' },
}

const FALLBACK = TYPE_CONFIG.source

export default function CustomNode({ data, selected }) {
  const base = TYPE_CONFIG[data.type] ?? FALLBACK
  const stage = data.stage ? (STAGE_CFG[data.stage] ?? null) : null

  const accent    = stage?.accent    ?? base.accent
  const typeColor = stage?.typeColor ?? base.typeColor
  const typeLabel = stage?.label     ?? base.label
  const Icon      = base.icon

  const { dimmed, highlighted, isActive, upstreamCount = 0, downstreamCount = 0, diffStatus } = data

  const diffBorderColor = diffStatus === 'added' ? '#16a34a'
    : diffStatus === 'changed' ? '#d97706'
    : null

  const glowStyle = diffStatus === 'added'
    ? `0 0 0 2px white, 0 0 0 4px #16a34a`
    : diffStatus === 'changed'
    ? `0 0 0 2px white, 0 0 0 4px #d97706`
    : selected
    ? `0 0 0 2px white, 0 0 0 2px #88c648`
    : '0 1px 4px rgba(0,0,0,0.08)'

  return (
    <div
      style={{
        opacity: dimmed ? 0.18 : 1,
        transform: isActive ? 'scale(1.06)' : highlighted ? 'scale(1.03)' : 'scale(1)',
        boxShadow: glowStyle,
        background: 'var(--node-bg)',
        position: 'relative',
        transition: 'opacity 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease',
        minWidth: 200,
        maxWidth: 240,
        borderRadius: 10,
        border: (highlighted || isActive)
          ? `2px solid ${accent}`
          : `1px solid var(--node-border)`,
        borderLeft: (highlighted || isActive)
          ? `2px solid ${accent}`
          : `3px solid ${diffBorderColor ?? accent}`,
        cursor: 'pointer',
      }}
    >

      {/* Handles */}
      {data.type !== 'source' && (
        <Handle type="target" position={Position.Left}
          style={{ background: accent, width: 8, height: 8, border: '2px solid white', left: -1 }} />
      )}
      {data.type !== 'use_case' && (
        <Handle type="source" position={Position.Right}
          style={{ background: accent, width: 8, height: 8, border: '2px solid white', right: -1 }} />
      )}

      <div style={{ padding: '10px 12px 8px 12px', position: 'relative' }}>
        {/* Icon badge + sheet */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Colored icon badge */}
            <div style={{
              width: 22, height: 22, borderRadius: 6, flexShrink: 0,
              background: diffBorderColor ?? accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={12} color="white" />
            </div>
            <span style={{
              fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
              color: typeColor,
            }}>
              {typeLabel}
            </span>
          </div>
          {data.sheet && (
            <span style={{
              fontSize: 9, color: 'var(--node-sheet-color)', fontFamily: 'monospace',
              background: 'var(--node-sheet-bg)', padding: '1px 5px', borderRadius: 4,
              maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {data.sheet}
            </span>
          )}
        </div>

        {/* Node label */}
        <p style={{
          fontSize: 13, fontWeight: 600, color: 'var(--node-label-color)',
          lineHeight: 1.3, marginBottom: 8,
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {data.label}
        </p>

        {/* Dependency counts */}
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
