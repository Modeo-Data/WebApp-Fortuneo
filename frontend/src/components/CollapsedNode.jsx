import { Handle, Position } from '@xyflow/react'
import { GitMerge } from 'lucide-react'

const ACCENT      = '#F59E0B'
const TYPE_COLOR  = '#D97706'
const DROPDOWN_W  = 212
const ITEM_H      = 30
const MAX_VISIBLE = 7

export default function CollapsedNode({ data, selected }) {
  const { dimmed, highlighted, isActive, label = '', items = [], isOpen = false, onSelectItem } = data

  const glowStyle = isActive
    ? `0 0 0 2px white, 0 0 0 4px ${ACCENT}, 0 4px 20px ${ACCENT}44`
    : highlighted
    ? `0 0 0 2px white, 0 0 0 3px ${ACCENT}88`
    : selected
    ? `0 0 0 2px white, 0 0 0 2px #88c648`
    : '0 1px 4px rgba(0,0,0,0.08)'

  return (
    <div style={{
      opacity: dimmed ? 0.18 : 1,
      transform: isActive ? 'scale(1.06)' : highlighted ? 'scale(1.03)' : 'scale(1)',
      transition: 'opacity 0.2s ease, transform 0.2s ease',
      position: 'relative',
      width: 240,
      cursor: 'pointer',
    }}>
      <Handle type="target" position={Position.Left}
        style={{ background: ACCENT, width: 8, height: 8, border: '2px solid white', left: -1 }} />
      <Handle type="source" position={Position.Right}
        style={{ background: ACCENT, width: 8, height: 8, border: '2px solid white', right: -1 }} />

      {/* Stacked card shadows (depth effect) */}
      <div style={{
        position: 'absolute', top: -5, left: 6, right: -6,
        height: '100%', borderRadius: 10,
        background: 'var(--type-surface-transformation)',
        border: `1px solid ${ACCENT}55`,
        opacity: 0.6,
      }} />
      <div style={{
        position: 'absolute', top: -10, left: 12, right: -12,
        height: '100%', borderRadius: 10,
        background: 'var(--type-surface-transformation)',
        border: `1px solid ${ACCENT}33`,
        opacity: 0.35,
      }} />

      {/* Main card */}
      <div style={{
        position: 'relative',
        background: isActive || highlighted ? 'var(--type-active-transformation)' : 'var(--node-bg)',
        boxShadow: glowStyle,
        borderRadius: 10,
        borderTop:    '1px solid var(--node-border)',
        borderRight:  '1px solid var(--node-border)',
        borderBottom: '1px solid var(--node-border)',
        borderLeft:   `3px solid ${ACCENT}`,
        overflow: 'hidden',
        transition: 'box-shadow 0.2s ease, background 0.2s ease',
        padding: '10px 12px 8px 12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
          <GitMerge size={10} color={TYPE_COLOR} />
          <span style={{
            fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
            color: TYPE_COLOR,
          }}>
            Transformations
          </span>
        </div>

        <p style={{
          fontSize: 13, fontWeight: 700, color: 'var(--node-label-color)',
          lineHeight: 1.3, marginBottom: 6,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {label}
        </p>

        <div style={{
          borderTop: '1px solid var(--node-divider)', paddingTop: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 10, color: 'var(--node-count-color)' }}>
            {items.length} table{items.length !== 1 ? 's' : ''}
          </span>
          <span style={{
            fontSize: 9, color: ACCENT, fontWeight: 600,
            background: 'var(--type-surface-transformation)',
            padding: '2px 6px', borderRadius: 4,
          }}>
            {isOpen ? 'Click to collapse' : 'Click to expand'}
          </span>
        </div>
      </div>

      {/* Inline dropdown — rendered inside the same RF wrapper so clicks always work */}
      {isOpen && (
        <div
          onPointerDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: '100%',
            left: (240 - DROPDOWN_W) / 2,
            width: DROPDOWN_W,
            background: 'var(--node-bg)',
            borderTop: '1px dashed var(--node-divider)',
            borderRight: '1px solid var(--node-border)',
            borderBottom: '1px solid var(--node-border)',
            borderLeft: `3px solid ${ACCENT}`,
            borderBottomLeftRadius: 10,
            borderBottomRightRadius: 10,
            overflow: 'hidden',
            boxShadow: '0 6px 16px rgba(0,0,0,0.1)',
            maxHeight: MAX_VISIBLE * ITEM_H,
            overflowY: items.length > MAX_VISIBLE ? 'auto' : 'hidden',
            zIndex: 10,
          }}
        >
          {items.length === 0 && (
            <p style={{ fontSize: 10, color: 'var(--node-count-color)', padding: '8px 10px' }}>
              No tables
            </p>
          )}
          {items.map((item, i) => (
            <button
              key={item.id ?? i}
              onClick={e => { e.stopPropagation(); onSelectItem?.(item) }}
              style={{
                width: '100%', textAlign: 'left', background: 'none', border: 'none',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 9px',
                height: ITEM_H,
                borderBottom: i < items.length - 1 ? '1px solid var(--node-divider)' : 'none',
                boxSizing: 'border-box',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--type-surface-transformation)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <GitMerge size={8} color="#D97706" style={{ flexShrink: 0 }} />
              <span style={{
                fontSize: 10, fontWeight: 500, color: 'var(--node-label-color)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
              }}>
                {item.label ?? item.id}
              </span>
              {item.sheet && (
                <span style={{
                  fontSize: 8, color: 'var(--node-sheet-color)', fontFamily: 'monospace',
                  background: 'var(--node-sheet-bg)', padding: '1px 3px', borderRadius: 3,
                  flexShrink: 0, maxWidth: 52,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {item.sheet}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
