import { useState, useMemo } from 'react'
import { Search, X, ChevronLeft, Database } from 'lucide-react'
import { useDebounce } from '../hooks/useDebounce.js'
import { usePanelNav } from '../hooks/usePanelNav.js'
import { TYPE_CFG } from '../lib/nodeTypes.js'
import { getDownstream } from '../lib/graphUtils.js'
import NodeItem from './NodeItem.jsx'

const ACCENT = '#FF7327'
const ALL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export default function SourcesPanel({ nodes, edges, selectedNodeId, onSelect }) {
  const [search, setSearch]             = useState('')
  const [downSearch, setDownSearch]     = useState('')
  const [activeLetter, setActiveLetter] = useState(null)
  const [activeSource, setActiveSource] = useState(null)
  const debouncedSearch     = useDebounce(search)
  const debouncedDownSearch = useDebounce(downSearch)

  // ── Navigation history (shared hook) ────────────────────────────────────────
  const nav = usePanelNav({ activeLetter: null, activeSource: null })

  function applyNavState({ activeLetter: al, activeSource: as }) {
    setActiveLetter(al)
    setActiveSource(as)
    if (!as) setDownSearch('')
    if (!al && !as) setSearch('')
  }

  nav.onBackRef.current = () => {
    const prev = nav.back()
    if (prev !== undefined) applyNavState(prev)
  }
  nav.onForwardRef.current = () => {
    const next = nav.forward()
    if (next !== undefined) applyNavState(next)
  }

  function navigateTo(newState) {
    const current = nav.peek()
    if (current?.activeLetter === newState.activeLetter && current?.activeSource?.id === newState.activeSource?.id) return
    nav.push(newState)
    applyNavState(newState)
  }

  const panelProps = {
    className: 'flex flex-col flex-1 min-h-0',
    ...nav.panelProps,
  }

  // ── Data ─────────────────────────────────────────────────────────────────────
  const sourceNodes = useMemo(() => nodes.filter(n => n.type === 'source'), [nodes])

  const letterMap = useMemo(() => {
    const map = {}
    sourceNodes.forEach(n => {
      const key = (n.label?.[0] ?? '#').toUpperCase()
      ;(map[key] = map[key] ?? []).push(n)
    })
    Object.values(map).forEach(arr => arr.sort((a, b) => a.label.localeCompare(b.label)))
    return map
  }, [sourceNodes])

  const isSearching = debouncedSearch.trim().length > 0

  const visibleSources = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    if (q) return sourceNodes.filter(n => n.label?.toLowerCase().includes(q))
      .sort((a, b) => a.label.localeCompare(b.label))
    if (activeLetter) return letterMap[activeLetter] ?? []
    return []
  }, [debouncedSearch, activeLetter, sourceNodes, letterMap])

  const downstreamNodes = useMemo(() => {
    if (!activeSource) return []
    const ids = getDownstream(activeSource.id, edges)
    return nodes.filter(n => ids.has(n.id) && n.type !== 'source')
  }, [activeSource, nodes, edges])

  const filteredDownstream = useMemo(() => {
    const q = debouncedDownSearch.trim().toLowerCase()
    return q
      ? downstreamNodes.filter(n =>
          n.label?.toLowerCase().includes(q) || n.sheet?.toLowerCase().includes(q))
      : downstreamNodes
  }, [downstreamNodes, debouncedDownSearch])

  const downByType = useMemo(() => {
    const groups = { transformation: [], kpi: [], dashboard: [] }
    filteredDownstream.forEach(n => { if (groups[n.type]) groups[n.type].push(n) })
    return groups
  }, [filteredDownstream])

  // ── View: downstream of a source ─────────────────────────────────────────────
  if (activeSource) {
    return (
      <div {...panelProps}>
        <div className="px-3 pb-2 flex flex-col gap-2">
          <button
            onClick={() => nav.onBackRef.current()}
            className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
          >
            <ChevronLeft size={13} /> Back to sources
          </button>

          <div className="relative">
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
        </div>

        <div className="flex-1 overflow-y-auto border-t border-slate-100 pt-2">
          <p className="text-[9px] font-bold uppercase tracking-widest px-4 pb-2 text-slate-400">
            Downstream of <span className="text-slate-600">{activeSource.label}</span>
          </p>
          {filteredDownstream.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-3">No downstream nodes match</p>
          ) : (
            ['transformation', 'kpi', 'dashboard'].map(type => {
              const group = downByType[type]
              if (!group.length) return null
              const cfg = TYPE_CFG[type]
              return (
                <div key={type}>
                  <p className="text-[9px] font-bold uppercase tracking-widest px-4 py-1.5" style={{ color: cfg.color }}>
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

        <div className="px-3 py-2 border-t border-slate-100 text-[10px] text-slate-400">
          {filteredDownstream.length} / {downstreamNodes.length} downstream
        </div>
      </div>
    )
  }

  // ── View: source list (letter selected or searching) ─────────────────────────
  if (activeLetter || isSearching) {
    return (
      <div {...panelProps}>
        <div className="px-3 pb-2 flex flex-col gap-2">
          {!isSearching && (
            <button
              onClick={() => nav.onBackRef.current()}
              className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
            >
              <ChevronLeft size={13} /> All letters
            </button>
          )}

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

          {activeLetter && !isSearching && (
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-black"
                style={{ background: '#FFF4EE', color: ACCENT }}>{activeLetter}</span>
              <span className="text-xs text-slate-500">{visibleSources.length} source{visibleSources.length !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {visibleSources.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6 px-3">No sources match</p>
          ) : (
            visibleSources.map(node => {
              const cfg = TYPE_CFG.source
              return (
                <button key={node.id}
                  onClick={() => navigateTo({ activeLetter, activeSource: node })}
                  className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-slate-50 transition-colors"
                >
                  <div className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center" style={{ background: cfg.bg }}>
                    <Database size={11} style={{ color: cfg.color }} />
                  </div>
                  <p className="text-xs font-medium text-slate-700 truncate flex-1">{node.label}</p>
                </button>
              )
            })
          )}
        </div>

        <div className="px-3 py-2 border-t border-slate-100 text-[10px] text-slate-400">
          {isSearching
            ? `${visibleSources.length} result${visibleSources.length !== 1 ? 's' : ''}`
            : `${visibleSources.length} / ${sourceNodes.length} sources`}
        </div>
      </div>
    )
  }

  // ── View: A–Z letter picker (default) ────────────────────────────────────────
  return (
    <div {...panelProps}>
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

      <div className="flex-1 overflow-y-auto px-3">
        <div className="grid grid-cols-6 gap-1.5 py-2">
          {ALL_LETTERS.map(letter => {
            const count = letterMap[letter]?.length ?? 0
            const active = count > 0
            return (
              <button
                key={letter}
                disabled={!active}
                onClick={() => navigateTo({ activeLetter: letter, activeSource: null })}
                className="aspect-square rounded-lg flex flex-col items-center justify-center transition-colors"
                style={active
                  ? { background: '#FFF4EE', color: ACCENT, cursor: 'pointer' }
                  : { background: '#F8FAFC', color: '#CBD5E1', cursor: 'default' }}
                title={active ? `${count} source${count > 1 ? 's' : ''}` : undefined}
              >
                <span className="text-sm font-black leading-none">{letter}</span>
                {active && <span className="text-[8px] leading-none mt-0.5 font-medium opacity-70">{count}</span>}
              </button>
            )
          })}
        </div>
      </div>

      <div className="px-3 py-2 border-t border-slate-100 text-[10px] text-slate-400">
        {sourceNodes.length} sources · {Object.keys(letterMap).length} letters
      </div>
    </div>
  )
}
