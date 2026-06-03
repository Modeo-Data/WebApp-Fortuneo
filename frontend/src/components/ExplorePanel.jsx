import { useState, useMemo } from 'react'
import { Search, X } from 'lucide-react'
import { useDebounce } from '../hooks/useDebounce.js'
import { TYPE_CFG, ALL_TYPES } from '../lib/nodeTypes.js'
import NodeItem from './NodeItem.jsx'
import TypeCheckbox from './TypeCheckbox.jsx'

export default function ExplorePanel({ nodes, selectedNodeId, onSelect }) {
  const [search, setSearch] = useState('')
  const [activeTypes, setActiveTypes] = useState(new Set(ALL_TYPES))
  const debouncedSearch = useDebounce(search)

  function toggleType(type) {
    setActiveTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) { if (next.size === 1) return prev; next.delete(type) }
      else next.add(type)
      return next
    })
  }

  const typeCounts = useMemo(() => {
    const c = {}
    ALL_TYPES.forEach(t => { c[t] = 0 })
    nodes.forEach(n => { if (c[n.type] !== undefined) c[n.type]++ })
    return c
  }, [nodes])

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return nodes.filter(n =>
      activeTypes.has(n.type) &&
      (!q || n.label?.toLowerCase().includes(q) || n.sheet?.toLowerCase().includes(q))
    )
  }, [nodes, debouncedSearch, activeTypes])

  return (
    <>
      <div className="px-2 pt-2 pb-1">
        <div className="sb-wrap">
          <input
            type="text"
            className={`sb-input${search ? ' sb-active' : ''}`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher des nœuds…"
          />
          {search
            ? <button className="sb-clear" onClick={() => setSearch('')}><X size={11} /></button>
            : <div className="sb-icon"><Search size={13} /></div>
          }
        </div>
      </div>

      <div className="ep-tc-row">
        {ALL_TYPES.map(type => (
          <TypeCheckbox
            key={type}
            type={type}
            isActive={activeTypes.has(type)}
            count={typeCounts[type]}
            onToggle={toggleType}
          />
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {filtered.length === 0
          ? <p className="text-xs text-slate-400 text-center py-6">Aucun nœud trouvé</p>
          : ALL_TYPES.filter(t => activeTypes.has(t)).map(type => {
              const group = filtered.filter(n => n.type === type)
              if (!group.length) return null
              const cfg = TYPE_CFG[type]
              return (
                <div key={type}>
                  <p className="text-[9px] font-bold uppercase tracking-widest px-2 py-1.5" style={{ color: cfg.color }}>
                    {cfg.label} ({group.length})
                  </p>
                  {group.map(node => (
                    <NodeItem key={node.id} node={node} isSelected={node.id === selectedNodeId} onClick={onSelect} />
                  ))}
                </div>
              )
            })
        }
      </div>

      <div className="px-3 py-2 border-t border-slate-100 text-[10px] text-slate-400">
        {filtered.length} / {nodes.length} nœuds
      </div>
    </>
  )
}
