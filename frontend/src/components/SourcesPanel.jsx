import { useState, useMemo } from 'react'
import { ChevronLeft, Database, Search, X } from 'lucide-react'
import { useDebounce } from '../hooks/useDebounce.js'
import { usePanelNav } from '../hooks/usePanelNav.js'
import { TYPE_CFG } from '../lib/nodeTypes.js'
import { getDownstream } from '../lib/graphUtils.js'
import NodeItem from './NodeItem.jsx'

const ACCENT = '#88c648'
const ALL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

function SearchBar({ value, onChange, placeholder }) {
  return (
    <div className="px-2 pt-2 pb-1">
      <div className="sb-wrap">
        <input
          type="text"
          className={`sb-input${value ? ' sb-active' : ''}`}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
        />
        {value
          ? <button className="sb-clear" onClick={() => onChange({ target: { value: '' } })}><X size={11} /></button>
          : <div className="sb-icon"><Search size={13} /></div>
        }
      </div>
    </div>
  )
}

export default function SourcesPanel({ nodes, edges, selectedNodeId, onSelect }) {
  const [activeLetter, setActiveLetter] = useState(null)
  const [activeSource, setActiveSource] = useState(null)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)

  // ── Navigation history (shared hook) ────────────────────────────────────────
  const nav = usePanelNav({ activeLetter: null, activeSource: null })

  function applyNavState({ activeLetter: al, activeSource: as }) {
    setActiveLetter(al)
    setActiveSource(as)
    setSearch('')
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
    const q = debouncedSearch.trim().toLowerCase()
    return q
      ? downstreamNodes.filter(n =>
          n.label?.toLowerCase().includes(q) || n.sheet?.toLowerCase().includes(q))
      : downstreamNodes
  }, [downstreamNodes, debouncedSearch])

  const downByType = useMemo(() => {
    const groups = { transformation: [], use_case: [] }
    filteredDownstream.forEach(n => { if (groups[n.type]) groups[n.type].push(n) })
    return groups
  }, [filteredDownstream])

  // ── View: downstream of a source ─────────────────────────────────────────────
  if (activeSource) {
    return (
      <div {...panelProps}>
        <div className="px-3 pt-2 pb-1">
          <button
            onClick={() => nav.onBackRef.current()}
            className="flex items-center gap-1.5 text-[11px] text-app-muted hover:text-app-text transition-colors"
          >
            <ChevronLeft size={13} /> Retour aux sources
          </button>
        </div>

        <SearchBar
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filtrer en aval…"
        />

        <div className="flex-1 overflow-y-auto border-t border-app-border pt-2">
          <p className="text-[9px] font-bold uppercase tracking-widest px-4 pb-2 text-app-muted">
            En aval de <span className="text-app-text">{activeSource.label}</span>
          </p>
          {filteredDownstream.length === 0 ? (
            <p className="text-xs text-app-muted text-center py-3">Aucun nœud en aval trouvé</p>
          ) : (
            ['transformation', 'use_case'].map(type => {
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

        <div className="px-3 py-2 border-t border-app-border text-[10px] text-app-muted">
          {filteredDownstream.length} / {downstreamNodes.length} en aval
        </div>
      </div>
    )
  }

  // ── View: source list (letter selected or searching) ─────────────────────────
  if (activeLetter || isSearching) {
    return (
      <div {...panelProps}>
        <div className="px-3 pt-2 pb-1 flex items-center gap-2">
          {!isSearching && (
            <button
              onClick={() => nav.onBackRef.current()}
              className="flex items-center gap-1.5 text-[11px] text-app-muted hover:text-app-text transition-colors shrink-0"
            >
              <ChevronLeft size={13} /> {activeLetter}
            </button>
          )}
        </div>

        <SearchBar
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher des sources…"
        />

        <div className="flex-1 overflow-y-auto">
          {visibleSources.length === 0 ? (
            <p className="text-xs text-app-muted text-center py-6 px-3">Aucune source trouvée</p>
          ) : (
            visibleSources.map(node => {
              const cfg = TYPE_CFG.source
              return (
                <button key={node.id}
                  onClick={() => navigateTo({ activeLetter, activeSource: node })}
                  className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-app-bg transition-colors"
                >
                  <div className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center" style={{ background: cfg.bg }}>
                    <Database size={11} style={{ color: cfg.color }} />
                  </div>
                  <p className="text-xs font-medium text-app-text truncate flex-1">{node.label}</p>
                </button>
              )
            })
          )}
        </div>

        <div className="px-3 py-2 border-t border-app-border text-[10px] text-app-muted">
          {isSearching
            ? `${visibleSources.length} résultat${visibleSources.length !== 1 ? 's' : ''}`
            : `${visibleSources.length} / ${sourceNodes.length} sources`}
        </div>
      </div>
    )
  }

  // ── View: A–Z letter picker (default) ────────────────────────────────────────
  return (
    <div {...panelProps}>
      <SearchBar
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search sources…"
      />
      <div className="flex-1 overflow-y-auto px-3">
        <div className="grid grid-cols-4 gap-2 py-2">
          {ALL_LETTERS.map(letter => {
            const count = letterMap[letter]?.length ?? 0
            const active = count > 0
            return (
              <button
                key={letter}
                disabled={!active}
                onClick={() => navigateTo({ activeLetter: letter, activeSource: null })}
                className={`letter-btn${active ? ' active' : ' inactive'}`}
                title={active ? `${count} source${count > 1 ? 's' : ''}` : undefined}
              >
                <span className="letter-char">{letter}</span>
                {active && <span className="letter-count">{count}</span>}
              </button>
            )
          })}
        </div>
      </div>

      <div className="px-3 py-2 border-t border-app-border text-[10px] text-app-muted">
        {sourceNodes.length} sources · {Object.keys(letterMap).length} lettres
      </div>
    </div>
  )
}
