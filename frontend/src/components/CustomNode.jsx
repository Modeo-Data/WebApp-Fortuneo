import { Handle, Position } from '@xyflow/react'
import { Database, GitMerge, BarChart3, LayoutDashboard } from 'lucide-react'

const TYPE_CONFIG = {
  source: {
    icon: Database, label: 'Source',
    accent: '#3B82F6', typeColor: '#2563EB',
    accentBg: 'var(--type-surface-source)',
  },
  transformation: {
    icon: GitMerge, label: 'Transformation',
    accent: '#F59E0B', typeColor: '#D97706',
    accentBg: 'var(--type-surface-transformation)',
  },
  kpi: {
    icon: BarChart3, label: 'KPI',
    accent: '#10B981', typeColor: '#059669',
    accentBg: 'var(--type-surface-kpi)',
  },
  dashboard: {
    icon: LayoutDashboard, label: 'Dashboard',
    accent: '#7C3AED', typeColor: '#7C3AED',
    accentBg: 'var(--type-surface-dashboard)',
  },
}

const FALLBACK = TYPE_CONFIG.source

export default function CustomNode({ data, selected }) {
  const cfg = TYPE_CONFIG[data.type] ?? FALLBACK
  const Icon = cfg.icon
  const { dimmed, highlighted, isActive, upstreamCount = 0, downstreamCount = 0 } = data

  const glowStyle = isActive
    ? `0 0 0 2px white, 0 0 0 4px ${cfg.accent}, 0 4px 20px ${cfg.accent}44`
    : highlighted
    ? `0 0 0 2px white, 0 0 0 3px ${cfg.accent}88`
    : selected
    ? `0 0 0 2px white, 0 0 0 2px #88c648`
    : '0 1px 4px rgba(0,0,0,0.08)'

  return (
    <div
      style={{
        opacity: dimmed ? 0.18 : 1,
        transform: isActive ? 'scale(1.06)' : highlighted ? 'scale(1.03)' : 'scale(1)',
        boxShadow: glowStyle,
        background: isActive || highlighted ? cfg.accentBg : 'var(--node-bg)',
        transition: 'opacity 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease',
        minWidth: 200,
        maxWidth: 240,
        borderRadius: 10,
        borderTop:    `1px solid var(--node-border)`,
        borderRight:  `1px solid var(--node-border)`,
        borderBottom: `1px solid var(--node-border)`,
        borderLeft:   `3px solid ${cfg.accent}`,
        overflow: 'hidden',
        cursor: 'pointer',
      }}
    >
      {/* Handles */}
      {data.type !== 'source' && (
        <Handle type="target" position={Position.Left}
          style={{ background: cfg.accent, width: 8, height: 8, border: '2px solid white', left: -1 }} />
      )}
      {data.type !== 'kpi' && data.type !== 'dashboard' && (
        <Handle type="source" position={Position.Right}
          style={{ background: cfg.accent, width: 8, height: 8, border: '2px solid white', right: -1 }} />
      )}

      <div style={{ padding: '10px 12px 8px 12px' }}>
        {/* Type + sheet */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon size={10} color={cfg.typeColor} />
            <span style={{
              fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
              color: cfg.typeColor,
            }}>
              {cfg.label}
            </span>
          </div>
          {data.sheet && (
            <span style={{
              fontSize: 9, color: 'var(--node-sheet-color)', fontFamily: 'monospace',
              background: 'var(--node-sheet-bg)', padding: '1px 5px', borderRadius: 4,
              maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
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
