import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'

const MIN_QUERY      = 1
const MAX_RESULTS    = 50
const EXIT_ANIM_MS   = 180


function matches(node, q) {
  const label = (node.label ?? '').toLowerCase()
  const id    = (node.id ?? '').toLowerCase()
  return label.includes(q) || id.includes(q)
}

function rankResult(node, q) {
  const label = (node.label ?? '').toLowerCase()
  if (label.startsWith(q)) return 0
  if (label.includes(q))   return 1
  return 2
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

function ResultsList({ query, results, onSelect }) {
  if (!results.length) {
    return (
      <div className="px-3 py-3 text-[11px]" style={{ color: 'var(--hp-subtext)' }}>
        Aucun résultat pour « {query} »
      </div>
    )
  }
  return (
    <>
      {results.map(n => (
        <button key={n.id}
          onClick={() => onSelect(n)}
          className="w-full text-left px-3 py-1.5 transition-colors flex items-center gap-2"
          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover, rgba(0,0,0,0.04))'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium truncate" style={{ color: 'var(--hp-text)' }}>
              {highlight(n.label, query)}
            </p>
            <p className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--hp-subtext)' }}>
              {n.type}{n.metadata?.job_type ? ` · ${n.metadata.job_type}` : ''}
            </p>
          </div>
        </button>
      ))}
    </>
  )
}


export default function GlobalSearch({ isOpen, onClose, nodes, onSelect }) {
  const [query,   setQuery]   = useState('')
  const [mounted, setMounted] = useState(false)
  const [exiting, setExiting] = useState(false)
  const inputRef  = useRef(null)
  const exitTimer = useRef(null)

  useEffect(() => {
    if (isOpen) {
      clearTimeout(exitTimer.current)
      setMounted(true)
      setExiting(false)
      requestAnimationFrame(() => inputRef.current?.focus())
    } else if (mounted) {
      setExiting(true)
      exitTimer.current = setTimeout(() => {
        setMounted(false)
        setExiting(false)
        setQuery('')
      }, EXIT_ANIM_MS)
    }
    return () => clearTimeout(exitTimer.current)
  }, [isOpen])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < MIN_QUERY) return []
    return (nodes ?? [])
      .filter(n => matches(n, q))
      .sort((a, b) => rankResult(a, q) - rankResult(b, q) || a.label.localeCompare(b.label))
      .slice(0, MAX_RESULTS)
  }, [query, nodes])

  if (!mounted) return null

  const showResults = query.trim().length >= MIN_QUERY

  function handleSelect(node) {
    onClose()
    onSelect(node)
  }

  return (
    <div
      className={`absolute top-3 left-1/2 -translate-x-1/2 z-30 ${exiting ? 'gs-floater-out' : 'gs-floater-in'}`}
      style={{ width: 440 }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 rounded-lg border px-3 py-2 shadow-lg"
        style={{ background: 'var(--hp-card-bg, white)', borderColor: '#88c648' }}>
        <Search size={13} style={{ color: 'var(--hp-subtext)' }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={`Rechercher dans ce graphe (${(nodes ?? []).length} nœuds)…`}
          className="flex-1 bg-transparent text-[12px] outline-none"
          style={{ color: 'var(--hp-text)' }}
        />
        {query && (
          <button onClick={() => { setQuery(''); inputRef.current?.focus() }}
            title="Effacer"
            className="p-0.5 rounded transition-colors"
            style={{ color: 'var(--hp-subtext)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover, rgba(0,0,0,0.06))'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <X size={12} />
          </button>
        )}
        <div className="w-px h-4" style={{ background: 'var(--hp-border)' }} />
        <button onClick={onClose}
          title="Fermer (Échap)"
          className="p-0.5 rounded transition-colors"
          style={{ color: 'var(--hp-subtext)' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover, rgba(0,0,0,0.06))'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <X size={14} />
        </button>
      </div>

      {showResults && (
        <div className="mt-1 rounded-lg border shadow-lg max-h-[60vh] overflow-y-auto"
          style={{ background: 'var(--hp-card-bg, white)', borderColor: 'var(--hp-border)' }}>
          <ResultsList query={query} results={results} onSelect={handleSelect} />
        </div>
      )}
    </div>
  )
}
