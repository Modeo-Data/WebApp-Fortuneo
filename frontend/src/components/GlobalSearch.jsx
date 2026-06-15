import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import axios from 'axios'

const DEBOUNCE_MS = 220
const MIN_QUERY   = 2
const MAX_RESULTS = 60


// ── Helpers ─────────────────────────────────────────────────────────────────────

function debounce(fn, delay) {
  let t
  return (...args) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), delay)
  }
}

function groupByGraph(results) {
  const map = new Map()
  for (const r of results) {
    if (!map.has(r.session_id)) map.set(r.session_id, { name: r.graph_name, items: [] })
    map.get(r.session_id).items.push(r)
  }
  return [...map.entries()].map(([sid, v]) => ({ sessionId: sid, name: v.name, items: v.items }))
}

function highlight(text, query) {
  if (!query) return text
  const i = text.toLowerCase().indexOf(query.toLowerCase())
  if (i < 0) return text
  return (
    <>
      {text.slice(0, i)}
      <mark style={{ background: '#88c64830', color: 'inherit', borderRadius: 2 }}>
        {text.slice(i, i + query.length)}
      </mark>
      {text.slice(i + query.length)}
    </>
  )
}


// ── Component ───────────────────────────────────────────────────────────────────

export default function GlobalSearch({ currentSessionId, onSelect }) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open,    setOpen]    = useState(false)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)

  // Debounced fetch
  const fetchResults = useMemo(() => debounce((q) => {
    if (q.length < MIN_QUERY) { setResults([]); setLoading(false); return }
    setLoading(true)
    axios.get('/api/search/', { params: { q } })
      .then(({ data }) => setResults(Array.isArray(data) ? data.slice(0, MAX_RESULTS) : []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }, DEBOUNCE_MS), [])

  useEffect(() => { fetchResults(query) }, [query, fetchResults])

  // Close on outside click
  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  // Keyboard shortcut: Cmd/Ctrl+K to focus
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      } else if (e.key === 'Escape' && open) {
        setOpen(false)
        inputRef.current?.blur()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const grouped       = groupByGraph(results)
  const showDropdown  = open && query.length >= MIN_QUERY
  const hasResults    = results.length > 0
  const ariaShortcut  = navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl+K'

  function handleSelect(r) {
    setOpen(false)
    setQuery('')
    onSelect(r)
  }

  return (
    <div ref={wrapRef} className="relative" style={{ width: 280 }}>
      <div className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition-colors"
        style={{
          background:   open ? 'var(--hp-card-bg, white)' : 'var(--hp-search-bg)',
          borderColor:  open ? '#88c648' : 'var(--hp-border)',
        }}>
        <Search size={12} style={{ color: 'var(--hp-subtext)' }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={`Rechercher un nœud  (${ariaShortcut})`}
          className="flex-1 bg-transparent text-[11px] outline-none"
          style={{ color: 'var(--hp-text)' }}
        />
        {query && (
          <button onClick={() => { setQuery(''); inputRef.current?.focus() }}
            style={{ color: 'var(--hp-subtext)' }}>
            <X size={11} />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border shadow-lg max-h-[60vh] overflow-y-auto"
          style={{ background: 'var(--hp-card-bg, white)', borderColor: 'var(--hp-border)' }}>
          {loading && (
            <div className="px-3 py-3 text-[11px]" style={{ color: 'var(--hp-subtext)' }}>
              Recherche en cours…
            </div>
          )}
          {!loading && !hasResults && (
            <div className="px-3 py-3 text-[11px]" style={{ color: 'var(--hp-subtext)' }}>
              Aucun résultat pour « {query} »
            </div>
          )}
          {!loading && hasResults && grouped.map(g => (
            <div key={g.sessionId}>
              <div className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider sticky top-0"
                style={{ color: 'var(--hp-subtext)', background: 'var(--hp-header-bg)' }}>
                {g.name}
                {g.sessionId === currentSessionId && (
                  <span className="ml-1.5 text-[8px] font-medium" style={{ color: '#88c648' }}>(actuel)</span>
                )}
              </div>
              {g.items.map(r => (
                <button key={`${r.session_id}-${r.node_id}`}
                  onClick={() => handleSelect(r)}
                  className="w-full text-left px-3 py-1.5 transition-colors flex items-center gap-2"
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover, rgba(0,0,0,0.04))'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium truncate" style={{ color: 'var(--hp-text)' }}>
                      {highlight(r.label, query)}
                    </p>
                    <p className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--hp-subtext)' }}>
                      {r.type}{r.sheet && ` · ${r.sheet}`}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
