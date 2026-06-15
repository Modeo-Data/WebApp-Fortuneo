import { useState, useMemo } from 'react'
import { Search, X, Database, Layers, Box, GitMerge, LayoutDashboard } from 'lucide-react'
import { useDebounce } from '../hooks/useDebounce.js'
import NodeItem from './NodeItem.jsx'
import TypeCheckbox from './TypeCheckbox.jsx'

// Types hidden from the explorer entirely
const HIDDEN = new Set(['datalake', 'datawarehouse'])

// Display groups — order controls the panel order
const DISPLAY_GROUPS = [
  { key: 'source',   label: 'Source',    color: '#2563eb', Icon: Database,       types: ['source'] },
  { key: 'feature',  label: 'Feature',   color: '#88c648', Icon: Layers,         types: ['feature'] },
  { key: 'component',label: 'Component', color: '#8b5cf6', Icon: Box,            types: ['component'] },
  { key: 'transfo',  label: 'Transfo',   color: '#d97706', Icon: GitMerge,       types: ['ingest', 'compute', 'virtual', 'extract', 'collection', 'transformation'] },
  { key: 'use_case', label: 'Dashboard', color: '#7c3aed', Icon: LayoutDashboard,types: ['use_case'] },
]

// Map every underlying type → its display group key
const TYPE_TO_GROUP = {}
DISPLAY_GROUPS.forEach(g => g.types.forEach(t => { TYPE_TO_GROUP[t] = g.key }))

export default function ExplorePanel({ nodes, selectedNodeId, onSelect }) {
  const [search, setSearch]           = useState('')
  const [activeGroups, setActiveGroups] = useState(new Set(DISPLAY_GROUPS.map(g => g.key)))
  const debouncedSearch               = useDebounce(search)

  function toggleGroup(key) {
    setActiveGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) { if (next.size === 1) return prev; next.delete(key) }
      else next.add(key)
      return next
    })
  }

  // Count per group (excluding hidden types)
  const groupCounts = useMemo(() => {
    const c = {}
    DISPLAY_GROUPS.forEach(g => { c[g.key] = 0 })
    nodes.forEach(n => {
      if (HIDDEN.has(n.type)) return
      const gk = TYPE_TO_GROUP[n.type]
      if (gk) c[gk]++
    })
    return c
  }, [nodes])

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return nodes.filter(n => {
      if (HIDDEN.has(n.type)) return false
      const gk = TYPE_TO_GROUP[n.type]
      if (!gk || !activeGroups.has(gk)) return false
      if (!q) return true
      return n.label?.toLowerCase().includes(q) || n.sheet?.toLowerCase().includes(q)
    })
  }, [nodes, debouncedSearch, activeGroups])

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
        {DISPLAY_GROUPS.map(g => (
          <TypeCheckbox
            key={g.key}
            type={g.key}
            Icon={g.Icon}
            isActive={activeGroups.has(g.key)}
            count={groupCounts[g.key]}
            onToggle={toggleGroup}
          />
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {filtered.length === 0
          ? <p className="text-xs text-slate-400 text-center py-6">Aucun nœud trouvé</p>
          : DISPLAY_GROUPS.filter(g => activeGroups.has(g.key)).map(g => {
              const group = filtered.filter(n => TYPE_TO_GROUP[n.type] === g.key)
              if (!group.length) return null
              return (
                <div key={g.key}>
                  <p className="text-[9px] font-bold uppercase tracking-widest px-2 py-1.5"
                    style={{ color: g.color }}>
                    {g.label} ({group.length})
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
        {filtered.length} / {nodes.filter(n => !HIDDEN.has(n.type)).length} nœuds
      </div>
    </>
  )
}
