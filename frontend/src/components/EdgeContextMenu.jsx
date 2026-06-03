import { useEffect } from 'react'
import { PLATFORMS } from '../lib/platforms.js'

const OP_ICONS = {
  airflow: '◈', dbt: '⬡', spark: '⚡', databricks: '◆',
  snowflake: '❄', python: '🐍', sql: '⊞', airbyte: '↔',
  fivetran: '⇌', stitch: '↑', kafka: '≋', excel: '⊠', custom: '○',
}

const PLATFORM_GROUPS = [
  { label: 'Ingestion',      ids: ['airbyte', 'fivetran', 'stitch', 'kafka', 'excel'] },
  { label: 'Orchestration',  ids: ['airflow'] },
  { label: 'Transformation', ids: ['dbt', 'spark', 'databricks', 'snowflake', 'sql', 'python'] },
  { label: 'Autre',          ids: ['custom'] },
]

export default function EdgeContextMenu({ x, y, onSelect, onClose }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const W = 196, H = 290
  const cx = Math.min(x + 4, window.innerWidth  - W - 8)
  const cy = Math.min(y + 4, window.innerHeight - H - 8)

  return (
    <div
      style={{
        position: 'fixed', top: cy, left: cx, zIndex: 9999,
        background: 'white', borderRadius: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.06)',
        width: W, overflow: 'hidden',
      }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <div style={{
        padding: '7px 10px 5px',
        fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
        letterSpacing: '0.08em', color: '#94A3B8',
        borderBottom: '1px solid #F1F5F9',
      }}>
        Ajouter une étape
      </div>

      <div style={{ padding: 4, maxHeight: H - 32, overflowY: 'auto' }}>
        {PLATFORM_GROUPS.map(group => (
          <div key={group.label}>
            <div style={{
              fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.06em', color: '#CBD5E1',
              padding: '5px 8px 2px',
            }}>
              {group.label}
            </div>
            {group.ids.map(id => {
              const p = PLATFORMS[id]
              if (!p) return null
              return (
                <button
                  key={id}
                  onClick={() => onSelect(id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%', padding: '5px 8px',
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    borderRadius: 6, textAlign: 'left',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#F8FAFC' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <span style={{
                    width: 22, height: 22, borderRadius: 6,
                    background: p.color, color: p.textColor,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, flexShrink: 0,
                  }}>
                    {OP_ICONS[id] ?? id[0].toUpperCase()}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#334155', flex: 1 }}>
                    {p.name}
                  </span>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: p.color, flexShrink: 0,
                  }} />
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
