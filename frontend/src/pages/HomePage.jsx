import { useState, useEffect } from 'react'
import axios from 'axios'
import UploadModal from '../components/UploadModal.jsx'
import { useDebounce } from '../hooks/useDebounce.js'
import {
  Database, GitMerge, Layers, Box,
  Search, X, Loader2, ArrowUpRight, BarChart3,
  UploadCloud, HardDrive, Workflow, Clock, Sparkles,
} from 'lucide-react'
import DarkModeToggle from '../components/DarkModeToggle.jsx'
import SourceToggle from '../components/SourceToggle.jsx'

const ACCENT = '#88c648'

const CATEGORIES_BY_SOURCE = {
  dc: [
    { type: 'feature',       label: 'Features',     hint: 'Ownership root',         Icon: Layers,    color: '#88c648' },
    { type: 'component',     label: 'Components',   hint: 'Groupements',            Icon: Box,       color: '#8b5cf6' },
    { type: 'collection',    label: 'Collections',  hint: 'Jobs ETL',               Icon: GitMerge,  color: '#d97706' },
    { type: 'datawarehouse', label: 'Warehouses',   hint: 'Tables produites',       Icon: Database,  color: '#14b8a6' },
    { type: 'datalake',      label: 'Datalakes',    hint: 'Sources brutes',         Icon: HardDrive, color: '#ec4899' },
    { type: 'use_case',      label: 'Dashboards',   hint: 'Sinks finaux',           Icon: BarChart3, color: '#7c3aed' },
  ],
  odi: [
    { type: 'odi_mapping',   label: 'Scenarios',    hint: 'Mappings ODI',           Icon: Workflow,  color: '#db2777' },
    { type: 'datawarehouse', label: 'Tables',       hint: 'Référencées',            Icon: Database,  color: '#14b8a6' },
  ],
}

const CLICKABLE_BY_SOURCE = {
  dc:  new Set(['feature', 'component', 'collection']),
  odi: new Set(['odi_mapping']),
}

const SOURCE_KEY = 'nexus.activeSource'

function readStoredSource() {
  try { return localStorage.getItem(SOURCE_KEY) === 'odi' ? 'odi' : 'dc' } catch { return 'dc' }
}

function fmt(iso) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso))
  } catch { return iso }
}


// ── Kicker (uppercase eyebrow) ────────────────────────────────────────────────
function Kicker({ children, accent = false }) {
  return (
    <p
      className="text-[10px] font-bold uppercase tracking-[0.25em] flex items-center gap-2"
      style={{ color: accent ? ACCENT : 'var(--hp-subtext)' }}
    >
      <span className="inline-block h-px w-6" style={{ background: accent ? ACCENT : 'var(--hp-border)' }} />
      {children}
    </p>
  )
}


// ── Inline hero search (compact, no dropdown — Cmd+K opens the full one) ─────
function HeroSearch({ navigate }) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen]       = useState(false)
  const debouncedQuery        = useDebounce(query, 200)

  useEffect(() => {
    if (debouncedQuery.length < 2) { setResults([]); return }
    setLoading(true)
    axios.get('/api/search/', { params: { q: debouncedQuery } })
      .then(({ data }) => setResults(Array.isArray(data) ? data : []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }, [debouncedQuery])

  function handlePick(r) {
    setOpen(false); setQuery('')
    navigate(`/graph/${r.session_id}/${encodeURIComponent(r.node_id)}`)
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-3 px-0 py-3 border-b-2 transition-colors"
        style={{ borderColor: open ? ACCENT : 'var(--hp-border)' }}>
        <Search size={18} style={{ color: open ? ACCENT : 'var(--hp-subtext)' }} />
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Cherche un nœud, une feature, un dashboard…"
          className="flex-1 bg-transparent text-lg outline-none placeholder:font-light"
          style={{ color: 'var(--hp-text)' }}
        />
        {loading && <Loader2 size={16} className="animate-spin" style={{ color: 'var(--hp-subtext)' }} />}
        {query && !loading && (
          <button onClick={() => setQuery('')}><X size={16} style={{ color: 'var(--hp-subtext)' }} /></button>
        )}
      </div>
      {open && query.length >= 2 && (
        <div className="absolute left-0 right-0 top-full mt-2 z-30 border shadow-2xl max-h-[55vh] overflow-y-auto"
          style={{ background: 'var(--hp-card-bg)', borderColor: 'var(--hp-border)' }}>
          {results.length === 0
            ? <p className="px-4 py-3 text-sm" style={{ color: 'var(--hp-subtext)' }}>Aucun résultat</p>
            : results.slice(0, 10).map(r => (
                <button key={`${r.session_id}-${r.node_id}`}
                  onMouseDown={() => handlePick(r)}
                  className="w-full text-left px-4 py-2.5 flex items-center justify-between gap-4 transition-colors"
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover, rgba(0,0,0,0.04))'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--hp-text)' }}>{r.label}</p>
                    <p className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: 'var(--hp-subtext)' }}>
                      {r.type} <span style={{ color: 'var(--hp-dim)' }}>·</span> {r.graph_name}
                    </p>
                  </div>
                  <ArrowUpRight size={14} style={{ color: 'var(--hp-dim)' }} />
                </button>
              ))
          }
        </div>
      )}
    </div>
  )
}


const CATEGORY_PAGE_SIZE = 8


function CategoryRow({ node, color, busy, disabled, onSelect }) {
  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors disabled:opacity-50"
      onMouseEnter={e => e.currentTarget.style.background = `${color}10`}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {busy
        ? <Loader2 size={12} style={{ color }} className="animate-spin shrink-0" />
        : <span className="w-1 h-4 shrink-0" style={{ background: color }} />}
      <span className="text-sm font-medium truncate" style={{ color: 'var(--hp-text)' }}>{node.label}</span>
      <ArrowUpRight size={12} className="ml-auto shrink-0" style={{ color: 'var(--hp-dim)' }} />
    </button>
  )
}


function CategoryPager({ page, totalPages, onPage }) {
  const disablePrev = page <= 0
  const disableNext = page >= totalPages - 1
  return (
    <div className="flex items-center justify-between px-4 py-2 border-t"
      style={{ borderColor: 'var(--hp-border)', background: 'var(--hp-bg)' }}>
      <button
        onClick={() => onPage(p => Math.max(0, p - 1))}
        disabled={disablePrev}
        className="text-[10px] font-semibold uppercase tracking-wider transition-opacity disabled:opacity-30"
        style={{ color: 'var(--hp-subtext)' }}
      >
        ← Préc.
      </button>
      <span className="text-[10px] tabular-nums uppercase tracking-wider"
        style={{ color: 'var(--hp-subtext)' }}>
        {page + 1} / {totalPages}
      </span>
      <button
        onClick={() => onPage(p => Math.min(totalPages - 1, p + 1))}
        disabled={disableNext}
        className="text-[10px] font-semibold uppercase tracking-wider transition-opacity disabled:opacity-30"
        style={{ color: 'var(--hp-subtext)' }}
      >
        Suiv. →
      </button>
    </div>
  )
}


function CategoryTile({ category, count, items, clickable, onSelectNode, generating }) {
  const { type, label, hint, Icon, color } = category
  const [openList, setOpenList] = useState(false)
  const [page,     setPage]     = useState(0)

  const disabled    = !clickable || count === 0
  const totalPages  = Math.max(1, Math.ceil(items.length / CATEGORY_PAGE_SIZE))
  const safePage    = Math.min(page, totalPages - 1)
  const pageItems   = items.slice(safePage * CATEGORY_PAGE_SIZE, (safePage + 1) * CATEGORY_PAGE_SIZE)

  function handleClick() {
    if (disabled) return
    setOpenList(o => {
      if (!o) setPage(0)
      return !o
    })
  }

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        disabled={disabled}
        className="group relative w-full text-left p-5 transition-all"
        style={{
          background:    openList ? 'var(--hp-card-bg)' : 'transparent',
          borderTop:     `2px solid ${openList ? color : 'var(--hp-border)'}`,
          opacity:       count === 0 ? 0.4 : 1,
          cursor:        disabled ? 'default' : 'pointer',
        }}
        onMouseEnter={e => { if (!disabled && !openList) e.currentTarget.style.background = 'var(--hp-card-bg)' }}
        onMouseLeave={e => { if (!openList) e.currentTarget.style.background = 'transparent' }}
      >
        <div className="flex items-start justify-between mb-6">
          <Icon size={20} style={{ color }} strokeWidth={1.8} />
          {clickable && count > 0 && (
            <ArrowUpRight size={14}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color }} />
          )}
        </div>
        <div className="space-y-1">
          <p className="text-5xl font-black tabular-nums leading-none tracking-tight"
            style={{ color: 'var(--hp-text)' }}>
            {count}
          </p>
          <p className="text-sm font-semibold" style={{ color: 'var(--hp-text)' }}>{label}</p>
          <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--hp-subtext)' }}>{hint}</p>
        </div>
      </button>

      {openList && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpenList(false)} />
          <div className="absolute top-full left-0 right-0 z-50 mt-1 border shadow-2xl"
            style={{ background: 'var(--hp-card-bg)', borderColor: 'var(--hp-border)' }}>
            <div className="py-1">
              {pageItems.map(n => (
                <CategoryRow
                  key={n.node_id}
                  node={n}
                  color={color}
                  busy={generating === n.node_id}
                  disabled={!!generating}
                  onSelect={() => { onSelectNode(n.node_id); setOpenList(false) }}
                />
              ))}
            </div>
            {totalPages > 1 && (
              <CategoryPager page={safePage} totalPages={totalPages} onPage={setPage} />
            )}
          </div>
        </>
      )}
    </div>
  )
}


// ── Page ───────────────────────────────────────────────────────────────────────
export default function HomePage({ navigate }) {
  const [showImport, setShowImport]     = useState(false)
  const [importing, setImporting]       = useState(false)
  const [importError, setImportError]   = useState(null)
  const [catalogNodes, setCatalogNodes] = useState([])
  const [stats, setStats]               = useState({})
  const [totalNodes, setTotalNodes]     = useState(0)
  const [saved, setSaved]               = useState([])
  const [cached, setCached]             = useState([])
  const [loadingGraph, setLoadingGraph] = useState(false)
  const [insights, setInsights]         = useState(null)
  const [generating, setGenerating]     = useState(null)
  const [source, setSource]             = useState(readStoredSource)

  useEffect(() => { try { localStorage.setItem(SOURCE_KEY, source) } catch {} }, [source])

  useEffect(() => {
    axios.get('/api/catalog/nodes/', { params: { source, limit: 500 } })
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

    axios.get('/api/catalog/insights/', { params: { source } })
      .then(({ data }) => setInsights(data))
      .catch(() => {})
  }, [source])

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
      const { data } = await axios.post('/api/catalog/graph/', { source })
      navigate(`/graph/${data.session_id}`)
    } catch {
      setLoadingGraph(false)
    }
  }

  async function handleOpenNode(nodeId) {
    setGenerating(nodeId)
    try {
      const { data } = await axios.post('/api/catalog/graph/', { node_id: nodeId, source })
      navigate(`/graph/${data.session_id}`)
    } catch { setGenerating(null) }
  }

  const allGraphs   = [...saved, ...cached].slice(0, 5)
  const topInsights = [
    ...(insights?.duplicates ?? []).slice(0, 2),
    ...(insights?.critical_paths ?? []).slice(0, 2),
    ...(insights?.hot_spots ?? []).slice(0, 2),
  ].slice(0, 4)

  const categories = CATEGORIES_BY_SOURCE[source]
  const sourceLabel = source === 'dc' ? 'DataCatalyst' : 'Oracle Data Integrator'
  const sourceCode  = source === 'dc' ? 'DC' : 'ODI'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--hp-bg)', color: 'var(--hp-text)' }}>

      {/* ── Top bar ── */}
      <header className="sticky top-0 z-30 border-b backdrop-blur-md"
        style={{ borderColor: 'var(--hp-border)', background: 'var(--hp-header-bg)' }}>
        <div className="max-w-[1400px] mx-auto px-10 h-14 flex items-center gap-4">
          <button onClick={() => navigate('/')}
            className="flex items-center gap-2.5 shrink-0 hover:opacity-80 transition-opacity">
            <div style={{
              width: 28, height: 28, borderRadius: 7, background: ACCENT,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 15, color: 'white', flexShrink: 0,
            }}>N</div>
            <div className="text-left">
              <p className="text-sm font-bold leading-none" style={{ color: 'var(--hp-text)' }}>Nexus</p>
              <p className="text-[9px] font-semibold tracking-widest leading-none mt-0.5 uppercase" style={{ color: ACCENT }}>Explorer</p>
            </div>
          </button>

          <span className="text-app-dim" style={{ color: 'var(--hp-dim)' }}>/</span>
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--hp-subtext)' }}>
            {sourceCode} catalog
          </span>

          <div className="ml-auto flex items-center gap-2">
            <SourceToggle source={source} onChange={setSource} />
            <button onClick={() => { setImportError(null); setShowImport(true) }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{ color: 'var(--hp-text)', borderLeft: '1px solid var(--hp-border)' }}>
              <UploadCloud size={13} /> Importer
            </button>
            <DarkModeToggle />
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 max-w-[1400px] mx-auto w-full px-10 py-12">

        {/* Hero: editorial — source name as the title, stats as a line, action right-aligned */}
        <section className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-10">
          <div className="space-y-3">
            <Kicker accent>Catalogue {sourceCode}</Kicker>
            <h1 className="text-6xl lg:text-7xl font-black leading-[0.95] tracking-tighter"
              style={{ color: 'var(--hp-text)' }}>
              {sourceLabel}
            </h1>
            <p className="text-base tabular-nums" style={{ color: 'var(--hp-subtext)' }}>
              <span className="font-bold" style={{ color: 'var(--hp-text)' }}>{totalNodes}</span>
              <span className="mx-2" style={{ color: 'var(--hp-dim)' }}>·</span>
              {source === 'dc'
                ? <>
                    <span className="font-bold" style={{ color: 'var(--hp-text)' }}>{stats.feature ?? 0}</span> features
                    <span className="mx-2" style={{ color: 'var(--hp-dim)' }}>·</span>
                    <span className="font-bold" style={{ color: 'var(--hp-text)' }}>{stats.collection ?? 0}</span> collections
                    <span className="mx-2" style={{ color: 'var(--hp-dim)' }}>·</span>
                    <span className="font-bold" style={{ color: 'var(--hp-text)' }}>{stats.use_case ?? 0}</span> dashboards
                  </>
                : <>
                    <span className="font-bold" style={{ color: 'var(--hp-text)' }}>{stats.odi_mapping ?? 0}</span> scenarios
                    <span className="mx-2" style={{ color: 'var(--hp-dim)' }}>·</span>
                    <span className="font-bold" style={{ color: 'var(--hp-text)' }}>{stats.datawarehouse ?? 0}</span> tables référencées
                  </>}
            </p>
          </div>

          <button onClick={handleOpenGraph} disabled={loadingGraph || totalNodes === 0}
            className="self-start lg:self-end inline-flex items-center gap-3 group disabled:opacity-50"
            style={{ color: ACCENT }}>
            <span className="text-sm font-bold uppercase tracking-[0.15em]">
              {loadingGraph ? 'Chargement…' : 'Ouvrir le graphe'}
            </span>
            <span className="w-12 h-12 rounded-full flex items-center justify-center transition-transform group-hover:translate-x-1"
              style={{ background: ACCENT, color: 'white' }}>
              {loadingGraph ? <Loader2 size={18} className="animate-spin" /> : <ArrowUpRight size={18} />}
            </span>
          </button>
        </section>

        {/* Search — large, full width, understated */}
        <section className="mb-14">
          <HeroSearch navigate={navigate} />
        </section>

        {/* Categories — primary navigation, edge-to-edge grid */}
        <section className="mb-16">
          <div className="flex items-end justify-between mb-5">
            <Kicker>Catégories</Kicker>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--hp-subtext)' }}>
              {categories.length} types
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 border-l"
            style={{ borderColor: 'var(--hp-border)' }}>
            {categories.map(c => (
              <div key={c.type} className="border-r border-b"
                style={{ borderColor: 'var(--hp-border)' }}>
                <CategoryTile
                  category={c}
                  count={stats[c.type] ?? 0}
                  items={catalogNodes.filter(n => n.type === c.type)}
                  clickable={CLICKABLE_BY_SOURCE[source].has(c.type)}
                  onSelectNode={handleOpenNode}
                  generating={generating}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Activity row — two columns: Récents | Suggestions */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          <ActivityColumn
            title="Récents"
            Icon={Clock}
            items={allGraphs}
            empty="Aucun graphe ouvert récemment."
            renderItem={g => (
              <button key={g.session_id} onClick={() => navigate(`/graph/${g.session_id}`)}
                className="group w-full flex items-baseline gap-4 py-3 border-t text-left transition-colors"
                style={{ borderColor: 'var(--hp-border)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover, rgba(0,0,0,0.03))'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span className="text-[10px] tabular-nums uppercase tracking-wider w-20 shrink-0"
                  style={{ color: 'var(--hp-subtext)' }}>{fmt(g.timestamp)}</span>
                <span className="text-base font-semibold flex-1 truncate" style={{ color: 'var(--hp-text)' }}>
                  {g.name}
                </span>
                <span className="text-xs tabular-nums" style={{ color: 'var(--hp-subtext)' }}>{g.node_count}n</span>
                <ArrowUpRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: ACCENT }} />
              </button>
            )}
          />
          <ActivityColumn
            title="Suggestions"
            Icon={Sparkles}
            items={topInsights}
            empty="Aucune anomalie détectée."
            renderItem={(insight, i) => <SuggestionItem key={i} insight={insight} />}
          />
        </section>
      </main>

      <footer className="border-t" style={{ borderColor: 'var(--hp-border)' }}>
        <div className="max-w-[1400px] mx-auto px-10 py-5 flex items-center justify-between text-[11px] uppercase tracking-wider"
          style={{ color: 'var(--hp-subtext)' }}>
          <span style={{ color: ACCENT, fontWeight: 700 }}>Nexus Explorer</span>
          <span>Data lineage visualization</span>
        </div>
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


function ActivityColumn({ title, Icon, items, empty, renderItem }) {
  return (
    <div>
      <div className="flex items-center gap-3 pb-3 mb-1 border-b-2"
        style={{ borderColor: 'var(--hp-text)' }}>
        <Icon size={14} style={{ color: 'var(--hp-text)' }} strokeWidth={2} />
        <span className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--hp-text)' }}>
          {title}
        </span>
        <span className="ml-auto text-[10px] tabular-nums uppercase tracking-wider"
          style={{ color: 'var(--hp-subtext)' }}>
          {items.length}
        </span>
      </div>
      {items.length === 0
        ? <p className="text-sm py-6" style={{ color: 'var(--hp-muted)' }}>{empty}</p>
        : <div>{items.map(renderItem)}</div>
      }
    </div>
  )
}


function SuggestionItem({ insight }) {
  const isDup = insight.type === 'duplicate'
  const isHot = insight.type === 'hot_spot'
  const color = isDup ? '#ef4444' : isHot ? '#f97316' : '#f59e0b'
  const tag   = isDup ? 'DOUBLON' : isHot ? 'HOT-SPOT' : 'CHAÎNE'
  const title = isDup
    ? `${insight.pair[0].label} ↔ ${insight.pair[1].label}`
    : isHot
      ? insight.label
      : `Chaîne de ${insight.length} étapes`
  const sub = isDup
    ? `${Math.round(insight.similarity * 100)}% similaires${insight.same_sql ? ' · même SQL' : ''}`
    : isHot
      ? `${insight.fan_out} lecteurs · ${insight.feature_count} feature${insight.feature_count > 1 ? 's' : ''}`
      : (insight.path ?? []).map(n => n.label).join(' → ')

  return (
    <div className="flex items-baseline gap-4 py-3 border-t"
      style={{ borderColor: 'var(--hp-border)' }}>
      <span className="text-[10px] font-bold uppercase tracking-wider w-20 shrink-0" style={{ color }}>
        {tag}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-base font-semibold truncate" style={{ color: 'var(--hp-text)' }}>{title}</p>
        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--hp-subtext)' }}>{sub}</p>
      </div>
    </div>
  )
}
