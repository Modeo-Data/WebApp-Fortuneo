import { Handle, Position } from '@xyflow/react'
import { PLATFORMS } from '../lib/platforms.js'

const OP_ICONS = {
  airflow:    '◈',
  dbt:        '⬡',
  spark:      '⚡',
  databricks: '◆',
  snowflake:  '❄',
  python:     '🐍',
  sql:        '⊞',
  airbyte:    '↔',
  fivetran:   '⇌',
  kafka:      '≋',
  custom:     '○',
}

export default function OperationNode({ data, selected }) {
  const { platformId, label, dimmed, highlighted, isActive } = data
  const platform = PLATFORMS[platformId] ?? PLATFORMS.custom
  const icon = OP_ICONS[platformId] ?? '○'

  const opacity  = dimmed ? 0.2 : 1
  const scale    = isActive ? 1.08 : highlighted ? 1.04 : 1
  const glowColor = isActive ? platform.color : highlighted ? '#F97316' : 'transparent'

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
      cursor: 'pointer',
      opacity,
      transform: `scale(${scale})`,
      transition: 'opacity 0.2s ease, transform 0.15s ease',
      filter: (isActive || highlighted) ? `drop-shadow(0 0 6px ${glowColor}99)` : 'none',
    }}>
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: platform.color, width: 8, height: 8, border: '2px solid white' }}
      />

      {/* Main chip */}
      <div style={{
        background: 'white',
        border: `2px solid ${isActive ? platform.color : selected ? '#88c648' : highlighted ? '#88c648' : platform.color}`,
        borderRadius: 12,
        padding: '6px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        boxShadow: selected
          ? `0 0 0 3px #6366F122, 0 4px 12px rgba(0,0,0,0.1)`
          : `0 2px 8px ${platform.color}22`,
        transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
        minWidth: 130,
        whiteSpace: 'nowrap',
      }}>
        {/* Icon */}
        <div style={{
          width: 28, height: 28,
          borderRadius: 8,
          background: platform.color,
          color: platform.textColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          flexShrink: 0,
          fontWeight: 700,
        }}>
          {icon}
        </div>

        <div style={{ minWidth: 0 }}>
          {/* Platform name */}
          <p style={{
            fontSize: 11,
            fontWeight: 800,
            color: platform.color,
            lineHeight: 1,
            marginBottom: label ? 2 : 0,
          }}>
            {platform.name}
          </p>
          {/* Custom label (DAG name, model, etc.) */}
          {label && (
            <p style={{
              fontSize: 10,
              fontWeight: 500,
              color: '#64748B',
              lineHeight: 1.2,
              maxWidth: 120,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {label}
            </p>
          )}
        </div>
      </div>

      {/* Op type label below */}
      <span style={{
        fontSize: 9,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: '#94A3B8',
      }}>
        operation
      </span>

      <Handle
        type="source"
        position={Position.Right}
        style={{ background: platform.color, width: 8, height: 8, border: '2px solid white' }}
      />
    </div>
  )
}
