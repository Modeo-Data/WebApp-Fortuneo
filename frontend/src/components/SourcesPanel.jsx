import { useState, useMemo } from 'react'
import { Search, X, ChevronRight, Database } from 'lucide-react'
import { useDebounce } from '../hooks/useDebounce.js'
import { TYPE_CFG } from '../lib/nodeTypes.js'
import { getDownstream } from '../lib/graphUtils.js'
import NodeItem from './NodeItem.jsx'

const ACCENT = '#FF7327'

export default function SourcesPanel({ nodes, edges, selectedNodeId, onSelect }) {
  const [search, setSearch]         = useState('')
  const [downSearch, setDownSearch] = useState('')
  const [activeSource, setActiveSource]     = useState(null)
  const [expandedSheets, setExpandedSheets] = useState(new Set())
  const debouncedSearch     = useDebounce(search)
  const debouncedDownSearch = useDebounce(downSearch)

  const sourceNodes = useMemo(() => nodes.filter(n => n.type === 'source'), [nodes])

  const letterGroups = useMemo(() => {
    const map = {}
    sourceNodes.forEach(n => {
      const key = (n.label?.[0] ?? '#').toUpperCase()
      ;(map[key] = map[key] ?? []).push(n)
    })
    return Object.entries(map)
      .map(([letter, srcs]) => ({ letter, sources: srcs.sort((a, b) => a.label.localeCompare(b.label)) }))
      .sort((a, b) => a.letter.localeCompare(b.letter))
  }, [sourceNodes])

  const filteredGroups = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return letterGroups
    return letterGroups
      .map(g => ({
        ...g,
        sources: g.sources.filter(n => n.label?.toLowerCase().includes(q)),
        forceOpen: true,
      }))
      .filter(g => g.sources.length > 0)
  }, [letterGroups, debouncedSearch])

  function toggleSheet(letter) {
    setExpandedSheets(prev => {
      const next = new Set(prev)
      next.has(letter) ? next.delete(letter) : next.add(letter)
      return next
    })
  }

  function isSheetOpen(g) {
    return g.forceOpen || expandedSheets.has(g.letter)
  }

  const downstreamNodes = useMemo(() => {
    if (!activeSource) return []
    const ids = getDownstream(activeSource.id, edges)
    return nodes.filter(n => ids.has(n.id) && n.type !== 'source')
  }, [activeSource, nodes, edges])

  const filteredDownstream = useMemo(() => {
    const q = debouncedDownSearch.trim().toLowerCase()
    return q
      ? downstreamNodes.filter(n =>
          n.label?.toLowerCase().includes(q) || n.sheet?.toLowerCase().includes(q)
        )
      : downstreamNodes
  }, [downstreamNodes, debouncedDownSearch])

  const downByType = useMemo(() => {
    const groups = { transformation: [], kpi: [] }
    filteredDownstream.forEach(n => { if (groups[n.type]) groups[n.type].push(n) })
    return groups
  }, [filteredDownstream])

  return (
    <>
      <div className="px-3 pb-2">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search sources…"
            className="w-full text-xs pl-7 pr-6 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none transition placeholder:text-slate-400"
            onFocus={e => e.target.style.boxShadow = `0 0 0 2px ${ACCENT}30`}
            onBlur={e => e.target.style.boxShadow = ''} />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">

        {!activeSource && (
          filteredGroups.length === 0
            ? <p className="text-xs text-slate-400 text-center py-6 px-3">No sources match</p>
            : filteredGroups.map(g => {
                const open = isSheetOpen(g)
                return (
                  <div key={g.letter}>
                    <button
                      onClick={() => toggleSheet(g.letter)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 transition-colors sticky top-0 bg-white z-10"
                    >
                      <span className="w-5 h-5 rounded flex items-center justify-center text-[11px] font-black shrink-0"
                        style={{ background: '#FFF4EE', color: ACCENT }}>{g.letter}</span>
                      <span className="text-[10px] text-slate-400 flex-1 text-left">{g.sources.length} source{g.sources.length > 1 ? 's' : ''}</span>
                      <ChevronRight size={11} className="shrink-0 text-slate-300 transition-transform"
                        style={{ transform: open ? 'rotate(90deg)' : 'none' }} />
                    </button>

                    {open && (
                      <div className="pb-1">
                        {g.sources.map(node => {
                          const cfg = TYPE_CFG.source
                          return (
                            <button key={node.id}
                              onClick={() => { setActiveSource(node); setDownSearch('') }}
                              className="w-full text-left pl-9 pr-3 py-2 flex items-center gap-2 transition-colors hover:bg-slate-50"
                            >
                              <div className="shrink-0 w-5 h-5 rounded flex items-center justify-center" style={{ background: cfg.bg }}>
                                <Database size={10} style={{ color: cfg.color }} />
                              </div>
                              <p className="text-xs font-medium text-slate-700 truncate flex-1">{node.label}</p>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })
        )}

        {activeSource && (
          <div className="px-2">
            {(() => {
              const cfg = TYPE_CFG.source
              return (
                <button
                  onClick={() => { setActiveSource(null); setDownSearch('') }}
                  className="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-2.5 mb-2"
                  style={{ background: cfg.activeBg, border: `1px solid ${cfg.border}` }}
                >
                  <div className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center" style={{ background: cfg.bg }}>
                    <Database size={12} style={{ color: cfg.color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-700 truncate">{activeSource.label}</p>
                    {activeSource.sheet && <p className="text-[10px] text-slate-400 font-mono truncate">{activeSource.sheet}</p>}
                  </div>
                  <ChevronRight size={12} style={{ color: cfg.color, transform: 'rotate(90deg)', flexShrink: 0 }} />
                </button>
              )
            })()}

            <div className="border-t border-slate-100 pt-2">
              <p className="text-[9px] font-bold uppercase tracking-widest px-1 pb-2 text-slate-400">
                Downstream of <span className="text-slate-600">{activeSource.label}</span>
              </p>

              <div className="relative mb-2">
                <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input type="text" value={downSearch} onChange={e => setDownSearch(e.target.value)}
                  placeholder="Filter downstream…"
                  className="w-full text-xs pl-7 pr-6 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none transition placeholder:text-slate-400"
                  onFocus={e => e.target.style.boxShadow = `0 0 0 2px ${ACCENT}30`}
                  onBlur={e => e.target.style.boxShadow = ''} />
                {downSearch && (
                  <button onClick={() => setDownSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X size={10} />
                  </button>
                )}
              </div>

              {filteredDownstream.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-3">No downstream nodes match</p>
              ) : (
                ['transformation', 'kpi'].map(type => {
                  const group = downByType[type]
                  if (!group.length) return null
                  const cfg = TYPE_CFG[type]
                  return (
                    <div key={type}>
                      <p className="text-[9px] font-bold uppercase tracking-widest px-1 py-1.5" style={{ color: cfg.color }}>
                        {cfg.label} ({group.length})
                      </p>
                      {group.map(node => (
                        <NodeItem key={node.id} node={node} isSelected={node.id === selectedNodeId} onClick={onSelect} />
                      ))}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-t border-slate-100 text-[10px] text-slate-400">
        {activeSource
          ? `${filteredDownstream.length} / ${downstreamNodes.length} downstream`
          : `${sourceNodes.length} sources · ${letterGroups.length} letters`}
      </div>
    </>
  )
}
