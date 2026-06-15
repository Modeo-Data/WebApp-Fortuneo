import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import UploadModal from '../components/UploadModal.jsx'
import { useDebounce } from '../hooks/useDebounce.js'
import {
  Database, GitMerge, Layers, Box,
  Search, X, Loader2, ArrowRight, BarChart3,
  History, UploadCloud, HardDrive,
} from 'lucide-react'
import DarkModeToggle from '../components/DarkModeToggle.jsx'

const ACCENT = '#88c648'

const TYPE_PILLS = [
  { type: 'feature',       label: 'Features',     Icon: Layers,    color: '#88c648' },
  { type: 'component',     label: 'Components',   Icon: Box,       color: '#8b5cf6' },
  { type: 'collection',    label: 'Collections',  Icon: GitMerge,  color: '#d97706' },
  { type: 'datalake',      label: 'Tables',       Icon: HardDrive, color: '#ec4899' },
  { type: 'datawarehouse', label: 'Warehouses',   Icon: Database,  color: '#14b8a6' },
]

const CLICKABLE_TYPES = new Set(['feature', 'component', 'collection'])

const TYPE_ICON = {
  feature:       { Icon: Layers,    color: '#88c648' },
  component:     { Icon: Box,       color: '#8b5cf6' },
  collection:    { Icon: GitMerge,  color: '#d97706' },
  datalake:      { Icon: HardDrive, color: '#ec4899' },
  datawarehouse: { Icon: Database,  color: '#14b8a6' },
}

function fmt(iso) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso))
  } catch { return iso }
}

// ── Global search ───────────────────────────────────────────────────────────────
function GlobalSearch({ navigate }) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen]       = useState(false)
  const debouncedQuery        = useDebounce(query, 250)
  const wrapRef               = useRef(null)

  useEffect(() => {
    if (debouncedQuery.length < 2) { setResults([]); return }
    setLoading(true)
    axios.get('/api/search/', { params: { q: debouncedQuery } })
      .then(({ data }) => setResults(data))
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }, [debouncedQuery])

  useEffect(() => {
    function onOut(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [])

  function goToNode(r) { setOpen(false); setQuery(''); navigate(`/graph/${r.session_id}?node=${r.node_id}`) }

  return (
    <div ref={wrapRef} className="relative w-full max-w-xl mx-auto">
      <div className="flex items-center rounded-xl border transition-all"
        style={{
          background: 'var(--hp-search-bg)',
          borderColor: open ? 'rgba(136,198,72,0.4)' : 'var(--hp-border)',
          boxShadow: open ? '0 0 0 3px rgba(136,198,72,0.08)' : 'none',
        }}>
        <Search size={14} className="ml-4 shrink-0" style={{ color: 'var(--hp-muted)' }} />
        <input
          type="text" value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Rechercher un flux, une table, un composant…"
          className="flex-1 bg-transparent outline-none py-2.5 px-3 text-sm"
          style={{ caretColor: ACCENT, color: 'var(--hp-search-text)' }}
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]) }} className="mr-3" style={{ color: 'var(--hp-muted)' }}>
            <X size={13} />
          </button>
        )}
      </div>

      {open && query.length >= 2 && (
        <div className="absolute top-full mt-2 w-full rounded-xl border overflow-hidden z-50"
          style={{ background: 'var(--hp-result-bg)', borderColor: 'var(--hp-border)', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
          {loading ? (
            <div className="flex items-center gap-2 px-4 py-3 text-sm" style={{ color: 'var(--hp-muted)' }}>
              <Loader2 size={12} className="animate-spin" /> Recherche…
            </div>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-sm" style={{ color: 'var(--hp-muted)' }}>Aucun résultat pour « {query} »</p>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {results.map((r, i) => {
                const { Icon, color } = TYPE_ICON[r.type] ?? { Icon: Database, color: '#64748b' }
                return (
                  <button key={`${r.session_id}-${r.node_id}-${i}`} onClick={() => goToNode(r)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                    style={{ borderBottom: i < results.length - 1 ? '1px solid var(--hp-border)' : 'none' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(128,128,128,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div className="shrink-0 w-6 h-6 rounded flex items-center justify-center" style={{ background: `${color}18` }}>
                      <Icon size={11} style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--hp-text)' }}>{r.label}</p>
                      <p className="text-[10px] truncate" style={{ color: 'var(--hp-muted)' }}>
                        {r.graph_name}{r.sheet ? ` · ${r.sheet}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded font-semibold capitalize"
                      style={{ background: `${color}18`, color }}>{r.type}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────────
export default function HomePage({ navigate }) {
  const [showImport, setShowImport]   = useState(false)
  const [importing, setImporting]     = useState(false)
  const [importError, setImportError] = useState(null)
  const [catalogNodes, setCatalogNodes] = useState([])
  const [stats, setStats]             = useState({})
  const [totalNodes, setTotalNodes]   = useState(0)
  const [saved, setSaved]             = useState([])
  const [cached, setCached]           = useState([])
  const [loadingGraph, setLoadingGraph] = useState(false)
  const [insights, setInsights]       = useState(null)
  const [generating, setGenerating]   = useState(null)
  const [openPill, setOpenPill]       = useState(null)  // type key of open pill menu
  const [pillPage, setPillPage]       = useState(0)

  useEffect(() => {
    axios.get('/api/catalog/nodes/')
      .then(({ data }) => {
        const nodes = data.nodes ?? []
        setCatalogNodes(nodes)
        setTotalNodes(data.total ?? 0)
        const counts = {}
        for (const n of nodes) counts[n.type] = (counts[n.type] ?? 0) + 1
        setStats(counts)
      })
      .catch(() => {})

    axios.get('/api/graphs/')
      .then(({ data }) => { setSaved(data.saved ?? []); setCached(data.cached ?? []) })
      .catch(() => {})

    axios.get('/api/catalog/insights/')
      .then(({ data }) => setInsights(data))
      .catch(() => {})
  }, [])

  async function handleCatalogImport(files) {
    setImporting(true); setImportError(null)
    const formData = new FormData()
    files.forEach(f => formData.append('file', f))
    try {
      await axios.post('/api/catalog/import/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setShowImport(false)
      window.location.reload()
    } catch (err) {
      setImportError(err.response?.data?.error ?? 'Erreur lors de l\'import.')
    } finally { setImporting(false) }
  }

  async function handleOpenGraph() {
    setLoadingGraph(true)
    try {
      const { data } = await axios.post('/api/catalog/graph/', {})
      navigate(`/graph/${data.session_id}`)
    } catch {
      setLoadingGraph(false)
    }
  }

  async function handleOpenNode(nodeId) {
    setGenerating(nodeId)
    try {
      const { data } = await axios.post('/api/catalog/graph/', { node_id: nodeId })
      navigate(`/graph/${data.session_id}`)
    } catch { setGenerating(null) }
  }

  const allGraphs = [...saved, ...cached].slice(0, 6)
  const topInsights = [
    ...(insights?.duplicates ?? []).slice(0, 2),
    ...(insights?.critical_paths ?? []).slice(0, 2),
  ].slice(0, 3)

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--hp-bg)', color: 'var(--hp-text)' }}>

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 border-b"
        style={{ borderTop: `3px solid ${ACCENT}`, borderBottomColor: 'var(--hp-border)', background: 'var(--hp-header-bg)', backdropFilter: 'blur(10px)' }}>
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <div style={{ width: 28, height: 28, borderRadius: 7, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, color: 'white', flexShrink: 0 }}>N</div>
            <div className="text-left">
              <p className="text-sm font-bold leading-none" style={{ color: 'var(--hp-text)' }}>Nexus</p>
              <p className="text-[9px] font-semibold tracking-widest leading-none mt-0.5 uppercase" style={{ color: ACCENT }}>Explorer</p>
            </div>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => { setImportError(null); setShowImport(true) }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-white shadow-sm transition-colors"
              style={{ background: ACCENT }}
              onMouseEnter={e => e.currentTarget.style.background = '#6aaf35'}
              onMouseLeave={e => e.currentTarget.style.background = ACCENT}
            >
              <UploadCloud size={13} /> Importer
            </button>
            <DarkModeToggle />
          </div>
        </div>
      </header>

      {/* ── Hero + Search ── */}
      <section className="max-w-3xl mx-auto px-6 pt-10 pb-6 w-full">
        <div className="text-center mb-6">
          <h1 className="text-xl font-black tracking-tight mb-1.5" style={{ color: 'var(--hp-text)' }}>
            Bienvenue sur Nexus
          </h1>
          <p className="text-sm mb-5" style={{ color: 'var(--hp-subtext)' }}>
            Explorez et comprenez vos flux de données
          </p>
          <GlobalSearch navigate={navigate} />
        </div>
      </section>

      {/* ── Type pills ── */}
      {totalNodes > 0 && (() => {
        const PAGE_SIZE = 8
        return (
          <div className="max-w-3xl mx-auto w-full px-6 pb-4">
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {TYPE_PILLS.filter(p => CLICKABLE_TYPES.has(p.type)).map(({ type, label, Icon, color }) => {
                const count = stats[type] ?? 0
                if (!count) return null
                const isOpen = openPill === type
                const items = catalogNodes.filter(n => n.type === type)
                const totalPages = Math.ceil(items.length / PAGE_SIZE)
                const page = isOpen ? pillPage : 0
                const pageItems = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
                return (
                  <div key={type} className="relative">
                    <button
                      onClick={() => { if (isOpen) { setOpenPill(null) } else { setOpenPill(type); setPillPage(0) } }}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-md border transition-all cursor-pointer"
                      style={{
                        borderColor: isOpen ? color : 'var(--hp-border)',
                        background: isOpen ? `${color}12` : 'var(--hp-card-bg)',
                        boxShadow: isOpen ? `0 0 0 1px ${color}30` : 'none',
                      }}
                      onMouseEnter={e => { if (!isOpen) { e.currentTarget.style.borderColor = color; e.currentTarget.style.background = `${color}10` } }}
                      onMouseLeave={e => { if (!isOpen) { e.currentTarget.style.borderColor = 'var(--hp-border)'; e.currentTarget.style.background = 'var(--hp-card-bg)' } }}>
                      <Icon size={9} style={{ color }} />
                      <span className="text-[11px] font-bold" style={{ color }}>{count}</span>
                      <span className="text-[9px] font-medium" style={{ color: 'var(--hp-muted)' }}>{label}</span>
                    </button>

                    {isOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setOpenPill(null)} />
                        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 w-52 rounded-lg border shadow-lg z-50 overflow-hidden"
                          style={{ background: 'var(--hp-header-bg)', borderColor: 'var(--hp-border)' }}>

                          <div className="py-1">
                            {pageItems.map(n => (
                              <button key={n.node_id} onClick={() => handleOpenNode(n.node_id)}
                                disabled={!!generating}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors disabled:opacity-50"
                                onMouseEnter={e => e.currentTarget.style.background = `${color}08`}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                {generating === n.node_id
                                  ? <Loader2 size={9} style={{ color }} className="animate-spin shrink-0" />
                                  : <Icon size={9} style={{ color, flexShrink: 0 }} />
                                }
                                <span className="text-[11px] font-medium truncate" style={{ color: 'var(--hp-text)' }}>{n.label}</span>
                                <ArrowRight size={9} className="ml-auto shrink-0" style={{ color: 'var(--hp-dim)' }} />
                              </button>
                            ))}
                          </div>

                          {totalPages > 1 && (
                            <div className="flex items-center justify-between px-3 py-1.5 border-t" style={{ borderColor: 'var(--hp-border)' }}>
                              <button onClick={() => setPillPage(p => Math.max(0, p - 1))} disabled={page === 0}
                                className="text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors disabled:opacity-30"
                                style={{ color: 'var(--hp-muted)' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover, rgba(0,0,0,0.04))'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                ← Préc.
                              </button>
                              <span className="text-[9px] font-medium" style={{ color: 'var(--hp-muted)' }}>
                                {page + 1} / {totalPages}
                              </span>
                              <button onClick={() => setPillPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                                className="text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors disabled:opacity-30"
                                style={{ color: 'var(--hp-muted)' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover, rgba(0,0,0,0.04))'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                Suiv. →
                              </button>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )
              })}

              <div className="w-px h-4" style={{ background: 'var(--hp-border)' }} />

              {TYPE_PILLS.filter(p => !CLICKABLE_TYPES.has(p.type)).map(({ type, label, Icon, color }) => {
                const count = stats[type] ?? 0
                if (!count) return null
                return (
                  <div key={type}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md border opacity-60"
                    style={{ borderColor: 'var(--hp-border)', background: 'var(--hp-card-bg)' }}>
                    <Icon size={9} style={{ color }} />
                    <span className="text-[11px] font-bold" style={{ color }}>{count}</span>
                    <span className="text-[9px] font-medium" style={{ color: 'var(--hp-muted)' }}>{label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* ── CTA: Explorer le catalogue ── */}
      <div className="max-w-3xl mx-auto w-full px-6 pb-6">
        <button onClick={handleOpenGraph} disabled={loadingGraph || totalNodes === 0}
          className="mx-auto flex items-center gap-2.5 px-4 py-2 rounded-lg border transition-all disabled:opacity-50"
          style={{ borderColor: ACCENT, background: `${ACCENT}08` }}
          onMouseEnter={e => { if (!loadingGraph) e.currentTarget.style.background = `${ACCENT}15` }}
          onMouseLeave={e => e.currentTarget.style.background = `${ACCENT}08`}>
          {loadingGraph
            ? <Loader2 size={13} style={{ color: ACCENT }} className="animate-spin" />
            : <BarChart3 size={13} style={{ color: ACCENT }} />
          }
          <span className="text-xs font-semibold" style={{ color: 'var(--hp-text)' }}>Explorer le catalogue</span>
          <ArrowRight size={12} style={{ color: ACCENT }} />
        </button>
      </div>

      <div className="max-w-3xl mx-auto w-full px-6">
        <div className="border-t" style={{ borderColor: 'var(--hp-border)' }} />
      </div>

      {/* ── Body: Récents + Suggestions ── */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Récents */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <History size={12} style={{ color: 'var(--hp-muted)' }} />
              <span className="text-xs font-bold" style={{ color: 'var(--hp-text)' }}>Récents</span>
            </div>
            {allGraphs.length === 0 ? (
              <p className="text-[11px] py-4" style={{ color: 'var(--hp-muted)' }}>Aucun graphe récent</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {allGraphs.map(g => (
                  <button key={g.session_id} onClick={() => navigate(`/graph/${g.session_id}`)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-all w-full"
                    style={{ background: 'var(--hp-card-bg)', borderColor: 'var(--hp-border)' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = `${ACCENT}55`}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--hp-border)'}>
                    <BarChart3 size={12} style={{ color: ACCENT, flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold truncate" style={{ color: 'var(--hp-text)' }}>{g.name}</p>
                      <p className="text-[10px]" style={{ color: 'var(--hp-muted)' }}>{fmt(g.timestamp)} · {g.node_count}n</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Suggestions rapides */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px]">💡</span>
              <span className="text-xs font-bold" style={{ color: 'var(--hp-text)' }}>Suggestions</span>
            </div>
            {topInsights.length === 0 ? (
              <p className="text-[11px] py-4" style={{ color: 'var(--hp-muted)' }}>Aucune suggestion</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {topInsights.map((insight, i) => {
                  const isDup = insight.type === 'duplicate'
                  const color = isDup ? '#ef4444' : '#f59e0b'
                  const title = isDup
                    ? `${insight.pair[0].label} ↔ ${insight.pair[1].label}`
                    : `Chaîne de ${insight.length} étapes`
                  const sub = isDup
                    ? `${Math.round(insight.similarity * 100)}% similaires${insight.same_sql ? ' · même SQL' : ''}`
                    : insight.path.map(n => n.label).join(' → ')
                  return (
                    <button key={i} onClick={handleOpenGraph}
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-all w-full"
                      style={{ background: 'var(--hp-card-bg)', borderColor: 'var(--hp-border)' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = `${color}55`}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--hp-border)'}>
                      <div className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                        style={{ background: `${color}15` }}>
                        <span className="text-[10px] font-bold" style={{ color }}>
                          {isDup ? '2x' : insight.length}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold truncate" style={{ color: 'var(--hp-text)' }}>{title}</p>
                        <p className="text-[10px] truncate" style={{ color: 'var(--hp-muted)' }}>{sub}</p>
                      </div>
                      <ArrowRight size={11} style={{ color: 'var(--hp-dim)', flexShrink: 0 }} />
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="text-center py-4 text-[11px]"
        style={{ color: 'var(--hp-dim)', borderTop: '1px solid var(--hp-border)' }}>
        <span style={{ color: ACCENT, fontWeight: 700 }}>nexus-explorer</span> — Visualisation de data lineage
      </footer>

      {showImport && (
        <UploadModal
          catalogMode
          onUpload={handleCatalogImport}
          loading={importing}
          error={importError}
          onClose={() => !importing && setShowImport(false)}
        />
      )}
    </div>
  )
}
