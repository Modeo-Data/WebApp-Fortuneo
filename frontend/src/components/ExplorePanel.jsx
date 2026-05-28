import { useState, useMemo } from 'react'
import { Search, X } from 'lucide-react'
import { useDebounce } from '../hooks/useDebounce.js'
import { TYPE_CFG, ALL_TYPES } from '../lib/nodeTypes.js'
import NodeItem from './NodeItem.jsx'

const ACCENT = '#FF7327'

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
    const c = { source: 0, transformation: 0, kpi: 0 }
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
      <div className="px-3 pb-2 space-y-2">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full text-xs pl-7 pr-6 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none transition placeholder:text-slate-400"
            onFocus={e => e.target.style.boxShadow = `0 0 0 2px ${ACCENT}30`}
            onBlur={e => e.target.style.boxShadow = ''} />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={11} />
            </button>
          )}
        </div>
        <div className="flex gap-1">
          {ALL_TYPES.map(type => {
            const cfg = TYPE_CFG[type]
            const active = activeTypes.has(type)
            return (
              <button key={type} onClick={() => toggleType(type)}
                className="flex-1 text-center py-1 rounded-md text-[10px] font-semibold transition-all"
                style={{
                  background: active ? cfg.bg : '#F8FAFC',
                  color: active ? cfg.color : '#94A3B8',
                  border: `1px solid ${active ? cfg.border : '#F1F5F9'}`,
                }}>
                {cfg.label}<span className="ml-0.5 opacity-60">·{typeCounts[type]}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {filtered.length === 0
          ? <p className="text-xs text-slate-400 text-center py-6">No nodes match</p>
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
        {filtered.length} / {nodes.length} nodes
      </div>
    </>
  )
}
