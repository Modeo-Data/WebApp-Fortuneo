import { GitMerge } from 'lucide-react'

// Slightly narrower than the collapsed node (240px → 212px), centered under it.
// Max 7 rows visible, scrollable beyond that.
export const DROPDOWN_ITEM_H = 30  // px per row — must match shift calculation in LineageGraph
export const DROPDOWN_MAX_VISIBLE = 7

export default function CollapsedDropdownNode({ data }) {
  const { items = [], onSelectItem, onMouseEnter, onMouseLeave } = data

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onPointerDown={e => e.stopPropagation()}
      style={{
        pointerEvents: 'all',
        width: 212,
        background: 'var(--node-bg)',
        borderTop: '1px dashed var(--node-divider)',
        borderRight: '1px solid var(--node-border)',
        borderBottom: '1px solid var(--node-border)',
        borderLeft: '3px solid #F59E0B',
        borderBottomLeftRadius: 10,
        borderBottomRightRadius: 10,
        overflow: 'hidden',
        boxShadow: '0 6px 16px rgba(0,0,0,0.1)',
        maxHeight: DROPDOWN_MAX_VISIBLE * DROPDOWN_ITEM_H,
        overflowY: items.length > DROPDOWN_MAX_VISIBLE ? 'auto' : 'hidden',
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
          onClick={e => { e.stopPropagation(); onSelectItem(item) }}
          style={{
            width: '100%', textAlign: 'left', background: 'none', border: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 9px',
            height: DROPDOWN_ITEM_H,
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
  )
}
