import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import UploadModal from '../components/UploadModal.jsx'
import { useDebounce } from '../hooks/useDebounce.js'
import {
  BarChart3, Clock, Plus, Database, Bookmark, BookmarkCheck,
  FlaskConical, BookOpen, History, Search, X, GitBranch, LayoutDashboard,
  LibraryBig, UploadCloud, Loader2, ArrowRight,
} from 'lucide-react'
import DarkModeToggle from '../components/DarkModeToggle.jsx'

const ACCENT = '#88c648'

const TYPE_ICON = {
  source:         { Icon: Database,        color: '#2563eb' },
  transformation: { Icon: GitBranch,       color: '#d97706' },
  use_case:       { Icon: LayoutDashboard, color: '#8b5cf6' },
}

function fmt(iso) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso))
  } catch { return iso }
}

const MODE_COLOR = {
  formula:    { bg: 'rgba(37,99,235,0.15)',  text: '#93c5fd' },
  structured: { bg: 'rgba(5,150,105,0.15)',  text: '#6ee7b7' },
}

// ── Global search ─────────────────────────────────────────────────────────────
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
    <div ref={wrapRef} className="relative w-full max-w-2xl mx-auto">
      <div className="flex items-center rounded-xl border transition-all"
        style={{
          background: 'var(--hp-search-bg)',
          borderColor: open ? 'rgba(136,198,72,0.4)' : 'var(--hp-border)',
          boxShadow: open ? '0 0 0 3px rgba(136,198,72,0.08)' : 'none',
        }}>
        <Search size={15} className="ml-4 shrink-0" style={{ color: 'var(--hp-muted)' }} />
        <input
          type="text" value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Rechercher un nœud dans tous les graphes…"
          className="flex-1 bg-transparent outline-none py-3 px-3 text-sm"
          style={{ caretColor: ACCENT, color: 'var(--hp-search-text)' }}
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]) }} className="mr-3" style={{ color: 'var(--hp-muted)' }}>
            <X size={14} />
          </button>
        )}
      </div>

      {open && query.length >= 2 && (
        <div className="absolute top-full mt-2 w-full rounded-xl border overflow-hidden z-50"
          style={{ background: 'var(--hp-result-bg)', borderColor: 'var(--hp-border)', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
          {loading ? (
            <div className="flex items-center gap-2 px-4 py-3 text-sm" style={{ color: 'var(--hp-muted)' }}>
              <div className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: 'var(--hp-muted)', borderTopColor: 'transparent' }} /> Recherche en cours…
            </div>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-sm" style={{ color: 'var(--hp-muted)' }}>Aucun résultat pour « {query} »</p>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              {results.map((r, i) => {
                const { Icon, color } = TYPE_ICON[r.type] ?? { Icon: Database, color: '#64748b' }
                return (
                  <button key={`${r.session_id}-${r.node_id}-${i}`} onClick={() => goToNode(r)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                    style={{ borderBottom: i < results.length - 1 ? '1px solid var(--hp-border)' : 'none' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(128,128,128,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center" style={{ background: `${color}18` }}>
                      <Icon size={13} style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--hp-text)' }}>{r.label}</p>
                      <p className="text-[11px] truncate" style={{ color: 'var(--hp-muted)' }}>
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
          {results.length > 0 && (
            <div className="px-4 py-1.5 border-t text-[10px]"
              style={{ borderColor: 'var(--hp-border)', color: 'var(--hp-dim)' }}>
              {results.length} résultat{results.length !== 1 ? 's' : ''} — cliquer pour ouvrir
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Graph card ────────────────────────────────────────────────────────────────
function GraphCard({ graph, onOpen, onToggleSave, saved, animClass }) {
  const mc = MODE_COLOR[graph.mode] ?? { bg: 'rgba(100,116,139,0.15)', text: '#94a3b8' }

  return (
    <div
      className={`group rounded-xl border transition-all cursor-pointer flex items-start gap-3 px-3.5 py-3 ${animClass}`}
      style={{ background: 'var(--hp-card-bg)', borderColor: 'var(--hp-border)' }}
      onClick={() => onOpen(graph.session_id)}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(136,198,72,0.35)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--hp-border)'}
    >
      <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5"
        style={{ background: 'rgba(136,198,72,0.1)' }}>
        <BarChart3 size={15} style={{ color: ACCENT }} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate leading-snug" style={{ color: 'var(--hp-text)' }}>{graph.name}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--hp-muted)' }}>
            <Clock size={8} /> {fmt(graph.timestamp)}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--hp-muted)' }}>{graph.node_count}n · {graph.edge_count}e</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
            style={{ background: mc.bg, color: mc.text }}>{graph.mode}</span>
        </div>
      </div>

      <button
        onClick={e => { e.stopPropagation(); onToggleSave(graph.session_id, saved) }}
        title={saved ? 'Retirer des enregistrés' : 'Enregistrer définitivement'}
        className="shrink-0 p-1 rounded-lg transition-colors mt-0.5"
        style={{ background: 'transparent' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(128,128,128,0.08)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        {saved
          ? <BookmarkCheck size={13} style={{ color: ACCENT }} />
          : <Bookmark size={13} style={{ color: 'var(--hp-muted)' }} />}
      </button>
    </div>
  )
}

function ColHeader({ title, subtitle, count, icon: Icon }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {Icon && <Icon size={13} style={{ color: ACCENT }} />}
      <div className="flex-1 min-w-0">
        <span className="text-xs font-bold" style={{ color: 'var(--hp-text)' }}>{title}</span>
        {subtitle && <span className="text-[10px] ml-2" style={{ color: 'var(--hp-muted)' }}>{subtitle}</span>}
      </div>
      {count > 0 && (
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
          style={{ background: 'rgba(136,198,72,0.1)', color: ACCENT }}>{count}</span>
      )}
    </div>
  )
}

function EmptyCol({ message }) {
  return (
    <div className="rounded-xl border border-dashed px-4 py-8 text-center"
      style={{ borderColor: 'var(--hp-border)', background: 'rgba(128,128,128,0.02)' }}>
      <p className="text-xs" style={{ color: 'var(--hp-dim)' }}>{message}</p>
    </div>
  )
}

// ── Catalog node card ─────────────────────────────────────────────────────────
function CatalogCard({ node, onGenerate, generating }) {
  const isGenerating = generating === node.node_id
  const { Icon, color } = node.type === 'use_case'
    ? { Icon: LayoutDashboard, color: '#8b5cf6' }
    : { Icon: Database, color: '#2563eb' }

  return (
    <button
      onClick={() => onGenerate(node.node_id)}
      disabled={!!generating}
      className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border text-left transition-all disabled:opacity-60"
      style={{ background: 'var(--hp-card-bg)', borderColor: 'var(--hp-border)' }}
      onMouseEnter={e => { if (!generating) e.currentTarget.style.borderColor = `${color}55` }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--hp-border)' }}
    >
      <div className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center" style={{ background: `${color}15` }}>
        {isGenerating
          ? <Loader2 size={13} style={{ color }} className="animate-spin" />
          : <Icon size={13} style={{ color }} />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate" style={{ color: 'var(--hp-text)' }}>{node.label}</p>
        {node.sheet && <p className="text-[10px] truncate" style={{ color: 'var(--hp-muted)' }}>{node.sheet}</p>}
      </div>
      <ArrowRight size={12} style={{ color: 'var(--hp-dim)', flexShrink: 0 }} />
    </button>
  )
}

// ── Catalog browser section ───────────────────────────────────────────────────
function CatalogBrowser({ navigate, onImportClick, importResult }) {
  const [tab, setTab]           = useState('source')
  const [query, setQuery]       = useState('')
  const [nodes, setNodes]       = useState([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(false)
  const [generating, setGenerating] = useState(null)
  const debouncedQuery          = useDebounce(query, 250)

  useEffect(() => {
    setLoading(true)
    axios.get('/api/catalog/nodes/', { params: { type: tab, q: debouncedQuery } })
      .then(({ data }) => { setNodes(data.nodes ?? []); setTotal(data.total ?? 0) })
      .catch(() => setNodes([]))
      .finally(() => setLoading(false))
  }, [tab, debouncedQuery])

  async function handleGenerate(nodeId) {
    setGenerating(nodeId)
    try {
      const { data } = await axios.post('/api/catalog/graph/', { node_id: nodeId })
      navigate(`/graph/${data.session_id}`)
    } catch { setGenerating(null) }
  }

  const TABS = [
    { key: 'source',   label: 'Sources',     Icon: Database,        color: '#2563eb' },
    { key: 'use_case', label: 'Dashboards',   Icon: LayoutDashboard, color: '#8b5cf6' },
  ]

  return (
    <section>
      {/* Section header */}
      <div className="flex items-center gap-2 mb-4">
        <LibraryBig size={14} style={{ color: ACCENT }} />
        <div className="flex-1">
          <span className="text-xs font-bold" style={{ color: 'var(--hp-text)' }}>Catalogue</span>
          {total > 0 && (
            <span className="text-[10px] ml-2" style={{ color: 'var(--hp-muted)' }}>{total} tables indexées</span>
          )}
        </div>
        <button
          onClick={onImportClick}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          style={{ border: '1px solid var(--hp-border)', color: 'var(--hp-subtext)' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.color = ACCENT }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--hp-border)'; e.currentTarget.style.color = 'var(--hp-subtext)' }}
        >
          <UploadCloud size={12} /> Importer
        </button>
      </div>

      {/* Import result toast */}
      {importResult && (
        <div className="mb-3 px-3 py-2 rounded-lg text-xs"
          style={{ background: 'rgba(136,198,72,0.1)', border: '1px solid rgba(136,198,72,0.25)', color: ACCENT }}>
          +{importResult.added_nodes} nœuds · +{importResult.added_edges} liens · {importResult.total_nodes} au total
        </div>
      )}

      {/* Type tabs */}
      <div className="flex gap-1 mb-3 p-0.5 rounded-lg" style={{ background: 'var(--rtab-strip)' }}>
        {TABS.map(({ key, label, Icon, color }) => (
          <button
            key={key}
            onClick={() => { setTab(key); setQuery('') }}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-all"
            style={tab === key
              ? { background: 'var(--hp-card-bg)', color, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
              : { color: 'var(--hp-muted)' }
            }
          >
            <Icon size={11} /> {label}
          </button>
        ))}
      </div>

      {/* Search within catalog */}
      {total > 0 && (
        <div className="flex items-center rounded-lg border mb-3 px-3"
          style={{ background: 'var(--hp-search-bg)', borderColor: 'var(--hp-border)' }}>
          <Search size={11} style={{ color: 'var(--hp-muted)', flexShrink: 0 }} />
          <input
            type="text" value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`Filtrer les ${tab === 'source' ? 'sources' : 'dashboards'}…`}
            className="flex-1 bg-transparent outline-none py-2 px-2 text-xs"
            style={{ color: 'var(--hp-search-text)', caretColor: ACCENT }}
          />
          {query && (
            <button onClick={() => setQuery('')} style={{ color: 'var(--hp-muted)' }}>
              <X size={11} />
            </button>
          )}
        </div>
      )}

      {/* Node list */}
      {loading ? (
        <div className="flex items-center gap-2 py-6 text-xs" style={{ color: 'var(--hp-muted)' }}>
          <Loader2 size={13} className="animate-spin" /> Chargement…
        </div>
      ) : total === 0 ? (
        <div className="rounded-xl border border-dashed px-4 py-8 text-center"
          style={{ borderColor: 'var(--hp-border)', background: 'rgba(128,128,128,0.02)' }}>
          <p className="text-xs" style={{ color: 'var(--hp-dim)' }}>Catalogue vide — importez des fichiers pour l'alimenter</p>
        </div>
      ) : nodes.length === 0 ? (
        <p className="text-xs py-4 text-center" style={{ color: 'var(--hp-muted)' }}>Aucun résultat pour « {query} »</p>
      ) : (
        <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
          {nodes.map(node => (
            <CatalogCard key={node.node_id} node={node} onGenerate={handleGenerate} generating={generating} />
          ))}
          {nodes.length === 200 && (
            <p className="text-[10px] text-center pt-1" style={{ color: 'var(--hp-dim)' }}>200 premiers résultats affichés — affinez la recherche</p>
          )}
        </div>
      )}
    </section>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function HomePage({ navigate }) {
  const [showModal, setShowModal]               = useState(false)
  const [catalogImportModal, setCatalogImportModal] = useState(false)
  const [uploading, setUploading]               = useState(false)
  const [uploadError, setUploadError]           = useState(null)
  const [catalogImporting, setCatalogImporting] = useState(false)
  const [catalogImportError, setCatalogImportError] = useState(null)
  const [catalogImportResult, setCatalogImportResult] = useState(null)
  const [saved, setSaved]                       = useState([])
  const [cached, setCached]                     = useState([])
  const [loading, setLoading]                   = useState(true)
  const [sampleLoading, setSampleLoading]       = useState(false)
  // tracks recently-moved IDs so we can play a slide animation
  const [movedToSaved, setMovedToSaved]         = useState(new Set())
  const [movedToCached, setMovedToCached]       = useState(new Set())

  function loadGraphs() {
    return axios.get('/api/graphs/')
      .then(({ data }) => { setSaved(data.saved ?? []); setCached(data.cached ?? []) })
      .catch(() => {})
  }

  useEffect(() => { loadGraphs().finally(() => setLoading(false)) }, [])

  function flashMoved(id, direction) {
    const setter = direction === 'saved' ? setMovedToSaved : setMovedToCached
    setter(prev => new Set([...prev, id]))
    setTimeout(() => setter(prev => { const n = new Set(prev); n.delete(id); return n }), 500)
  }

  async function handleToggleSave(id, isSaved) {
    try {
      if (isSaved) {
        await axios.delete(`/api/graphs/${id}/save/`)
        await loadGraphs()
        flashMoved(id, 'cached')
      } else {
        await axios.post(`/api/graphs/${id}/save/`)
        await loadGraphs()
        flashMoved(id, 'saved')
      }
    } catch {
      // request failed — leave UI unchanged
    }
  }

  async function handleUpload(files, mode, name) {
    setUploading(true); setUploadError(null)
    const formData = new FormData()
    files.forEach(f => formData.append('file', f))
    formData.append('mode', mode)
    if (name) formData.append('name', name)
    try {
      const { data } = await axios.post('/api/upload/', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      navigate(`/graph/${data.session_id}`)
    } catch (err) {
      setUploadError(err.response?.data?.error ?? 'Upload failed.')
    } finally { setUploading(false) }
  }

  async function handleLoadSample() {
    setSampleLoading(true)
    try {
      const res  = await fetch('/mock_lineage.xlsx')
      const blob = await res.blob()
      const file = new File([blob], 'mock_lineage.xlsx', { type: blob.type })
      const formData = new FormData()
      formData.append('file', file)
      formData.append('mode', 'structured')
      formData.append('name', 'Sample — mock_lineage.xlsx')
      const { data } = await axios.post('/api/upload/', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      navigate(`/graph/${data.session_id}`)
    } catch { /* silent */ } finally { setSampleLoading(false) }
  }

  async function handleCatalogImport(files, mode) {
    setCatalogImporting(true); setCatalogImportError(null); setCatalogImportResult(null)
    const formData = new FormData()
    files.forEach(f => formData.append('file', f))
    formData.append('mode', mode)
    try {
      const { data } = await axios.post('/api/catalog/import/', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      setCatalogImportResult(data)
      setCatalogImportModal(false)
    } catch (err) {
      setCatalogImportError(err.response?.data?.error ?? 'Import failed.')
    } finally { setCatalogImporting(false) }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--hp-bg)', color: 'var(--hp-text)' }}>

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 border-b"
        style={{ borderTop: `3px solid ${ACCENT}`, borderBottomColor: 'var(--hp-border)', background: 'var(--hp-header-bg)', backdropFilter: 'blur(10px)' }}>
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <div style={{ width: 28, height: 28, borderRadius: 7, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, color: 'white', flexShrink: 0 }}>N</div>
            <div className="text-left">
              <p className="text-sm font-bold leading-none" style={{ color: 'var(--hp-text)' }}>Nexus</p>
              <p className="text-[9px] font-semibold tracking-widest leading-none mt-0.5 uppercase" style={{ color: ACCENT }}>Explorer</p>
            </div>
          </button>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold"
            style={{ background: 'rgba(136,198,72,0.08)', border: '1px solid rgba(136,198,72,0.15)', color: ACCENT }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: ACCENT }} />
            Plateforme Data Lineage
          </span>
          <div className="ml-auto flex items-center gap-2">
            <DarkModeToggle />
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="max-w-5xl mx-auto px-6 pt-10 pb-8 w-full text-center">
        <h1 className="text-2xl font-black leading-tight mb-2 tracking-tight" style={{ color: 'var(--hp-text)' }}>
          Votre data lineage, <span style={{ color: ACCENT }}>entièrement cartographié.</span>
        </h1>
        <p className="text-sm max-w-md mx-auto mb-6" style={{ color: 'var(--hp-subtext)' }}>
          Tracez les sources, explorez les flux KPI et cartographiez les dépendances de votre stack de données.
        </p>

        <GlobalSearch navigate={navigate} />

        <div className="flex items-center justify-center gap-3 mt-5">
          <button onClick={() => { setUploadError(null); setShowModal(true) }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
            style={{ background: ACCENT }}
            onMouseEnter={e => e.currentTarget.style.background = '#6aaf35'}
            onMouseLeave={e => e.currentTarget.style.background = ACCENT}>
            <Plus size={14} strokeWidth={2.5} /> Nouveau graphe
          </button>
          <button onClick={handleLoadSample} disabled={sampleLoading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            style={{ border: '1px solid var(--hp-border)', color: 'var(--hp-subtext)' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--hp-muted)'; e.currentTarget.style.color = 'var(--hp-text)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--hp-border)'; e.currentTarget.style.color = 'var(--hp-subtext)' }}>
            <FlaskConical size={13} /> {sampleLoading ? 'Chargement…' : 'Essayer un exemple'}
          </button>
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="max-w-5xl mx-auto w-full px-6">
        <div className="border-t" style={{ borderColor: 'var(--hp-border)' }} />
      </div>

      {/* ── Three-column layout ── */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-6">
        {loading ? (
          <div className="flex items-center gap-2 text-sm py-8" style={{ color: 'var(--hp-muted)' }}>
            <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: 'var(--hp-muted)', borderTopColor: 'transparent' }} /> Chargement…
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-5">

            {/* Left — Recent (cached) */}
            <div>
              <ColHeader title="Récents" subtitle="Cache 24h" count={cached.length} icon={History} />
              {cached.length === 0
                ? <EmptyCol message='Aucun graphe récent — cliquez sur « Nouveau graphe » pour importer' />
                : <div className="flex flex-col gap-2">
                    {cached.map(g => (
                      <GraphCard key={g.session_id} graph={g}
                        onOpen={id => navigate(`/graph/${id}`)}
                        onToggleSave={handleToggleSave}
                        saved={false}
                        animClass={movedToCached.has(g.session_id) ? 'hp-slide-from-right' : ''}
                      />
                    ))}
                  </div>
              }
            </div>

            {/* Middle — Saved */}
            <div>
              <ColHeader title="Enregistrés" subtitle="Permanents" count={saved.length} icon={BookOpen} />
              {saved.length === 0
                ? <EmptyCol message="Aucun graphe enregistré — marquez un graphe récent" />
                : <div className="flex flex-col gap-2">
                    {saved.map(g => (
                      <GraphCard key={g.session_id} graph={g}
                        onOpen={id => navigate(`/graph/${id}`)}
                        onToggleSave={handleToggleSave}
                        saved
                        animClass={movedToSaved.has(g.session_id) ? 'hp-slide-from-left' : ''}
                      />
                    ))}
                  </div>
              }
            </div>

            {/* Right — Catalog */}
            <div>
              <CatalogBrowser
                navigate={navigate}
                onImportClick={() => { setCatalogImportError(null); setCatalogImportModal(true) }}
                importResult={catalogImportResult}
              />
            </div>

          </div>
        )}
      </main>

      <footer className="text-center py-4 text-[11px]" style={{ color: 'var(--hp-dim)', borderTop: '1px solid var(--hp-border)' }}>
        <span style={{ color: ACCENT, fontWeight: 700 }}>nexus-explorer</span> — Visualisation de data lineage
      </footer>

      {showModal && (
        <UploadModal onUpload={handleUpload} loading={uploading} error={uploadError} onClose={() => !uploading && setShowModal(false)} />
      )}

      {catalogImportModal && (
        <UploadModal
          catalogMode
          onUpload={handleCatalogImport}
          loading={catalogImporting}
          error={catalogImportError}
          onClose={() => !catalogImporting && setCatalogImportModal(false)}
        />
      )}
    </div>
  )
}
