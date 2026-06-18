import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import LineageGraph from '../components/LineageGraph.jsx'
import NodeDrawer from '../components/NodeDrawer.jsx'
import NodeSelector from '../components/NodeSelector.jsx'
import UploadModal from '../components/UploadModal.jsx'
import { saveRecentSession } from '../components/DiffPicker.jsx'
import { getSubgraph, simplifySubgraph } from '../lib/graphUtils.js'
import { UploadCloud, BarChart3, GitMerge, Database, Download, X, ChevronLeft, ChevronRight, RefreshCw, Loader2, Search, Eye, EyeOff } from 'lucide-react'
import DarkModeToggle from '../components/DarkModeToggle.jsx'
import GlobalSearch from '../components/GlobalSearch.jsx'
import SourceToggle from '../components/SourceToggle.jsx'
import { useSuggestionsState } from '../hooks/useSuggestionsState.js'

const SOURCE_KEY = 'nexus.activeSource'

const ACCENT = '#88c648'
const TRANSFO_TYPES = new Set(['ingest', 'compute', 'virtual', 'extract', 'collection', 'transformation', 'odi_mapping'])

// ── Catalog browser (shown when no session is loaded) ─────────────────────────
function CatalogBrowser({ navigate }) {
  const [nodes, setNodes]       = useState([])
  const [total, setTotal]       = useState(0)
  const [query, setQuery]       = useState('')
  const [loading, setLoading]   = useState(true)
  const [generating, setGenerating] = useState(null)

  useEffect(() => {
    setLoading(true)
    axios.get('/api/catalog/nodes/', { params: { q: query || undefined } })
      .then(({ data }) => { setNodes(data.nodes ?? []); setTotal(data.total ?? 0) })
      .catch(() => setNodes([]))
      .finally(() => setLoading(false))
  }, [query])

  async function handleGenerate(nodeId) {
    setGenerating(nodeId)
    try {
      const { data } = await axios.post('/api/catalog/graph/', { node_id: nodeId })
      navigate(`/graph/${data.session_id}`)
    } catch { setGenerating(null) }
  }

  return (
    <div className="flex flex-col h-full border-r overflow-hidden"
      style={{ width: 300, minWidth: 300, background: 'var(--hp-header-bg)', borderColor: 'var(--hp-border)' }}>
      <div className="px-4 pt-4 pb-3 border-b shrink-0" style={{ borderColor: 'var(--hp-border)' }}>
        <p className="text-xs font-bold mb-2" style={{ color: 'var(--hp-text)' }}>
          Catalogue <span className="font-normal ml-1" style={{ color: 'var(--hp-muted)' }}>{total} nœuds</span>
        </p>
        <div className="flex items-center rounded-lg border px-2.5"
          style={{ background: 'var(--hp-search-bg)', borderColor: 'var(--hp-border)' }}>
          <Search size={11} style={{ color: 'var(--hp-muted)', flexShrink: 0 }} />
          <input
            type="text" value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Filtrer…"
            className="flex-1 bg-transparent outline-none py-1.5 px-2 text-[11px]"
            style={{ color: 'var(--hp-search-text)', caretColor: ACCENT }}
          />
          {query && <button onClick={() => setQuery('')} style={{ color: 'var(--hp-muted)' }}><X size={10} /></button>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {loading ? (
          <div className="flex items-center gap-2 py-6 justify-center text-xs" style={{ color: 'var(--hp-muted)' }}>
            <Loader2 size={12} className="animate-spin" /> Chargement…
          </div>
        ) : nodes.length === 0 ? (
          <p className="text-[11px] py-6 text-center" style={{ color: 'var(--hp-muted)' }}>Aucun nœud importé</p>
        ) : (
          <div className="flex flex-col gap-1">
            {nodes.map(node => (
              <button key={node.node_id}
                onClick={() => handleGenerate(node.node_id)}
                disabled={!!generating}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-all disabled:opacity-60"
                style={{ background: 'var(--hp-card-bg)', borderColor: 'var(--hp-border)' }}
                onMouseEnter={e => { if (!generating) e.currentTarget.style.borderColor = `${ACCENT}55` }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--hp-border)' }}
              >
                {generating === node.node_id
                  ? <Loader2 size={11} style={{ color: ACCENT, flexShrink: 0 }} className="animate-spin" />
                  : <Database size={11} style={{ color: ACCENT, flexShrink: 0 }} />
                }
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium truncate" style={{ color: 'var(--hp-text)' }}>{node.label}</p>
                  <p className="text-[10px]" style={{ color: 'var(--hp-muted)' }}>{node.type}</p>
                </div>
              </button>
            ))}
            {nodes.length === 200 && (
              <p className="text-[10px] text-center pt-1" style={{ color: 'var(--hp-dim)' }}>
                200 premiers — affinez la recherche
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}


// ── Canvas placeholder ────────────────────────────────────────────────────────
const SOURCE_LABELS = { dc: 'DataCatalyst', odi: 'ODI' }


function FocusBreadcrumb({ source, focusedNode, subgraphCount, totalCount }) {
  const sourceLabel = SOURCE_LABELS[source] || source
  return (
    <div className="absolute top-3 left-3 z-10 flex items-stretch gap-2 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-md border shadow-sm"
        style={{ background: 'var(--hp-card-bg)', borderColor: 'var(--hp-border)' }}>
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--hp-subtext)' }}>
          {sourceLabel}
        </span>
        <span className="text-[10px]" style={{ color: 'var(--hp-dim)' }}>/</span>
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--hp-subtext)' }}>
          {focusedNode.type}
        </span>
        <span className="text-[10px]" style={{ color: 'var(--hp-dim)' }}>/</span>
        <span className="text-xs font-bold" style={{ color: ACCENT }}>
          {focusedNode.label}
        </span>
      </div>

      <div className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-md border shadow-sm tabular-nums"
        style={{ background: 'var(--hp-card-bg)', borderColor: 'var(--hp-border)' }}>
        <span className="text-xs font-bold" style={{ color: 'var(--hp-text)' }}>{subgraphCount}</span>
        <span className="text-[10px]" style={{ color: 'var(--hp-dim)' }}>/</span>
        <span className="text-[10px]" style={{ color: 'var(--hp-subtext)' }}>{totalCount} nœuds</span>
      </div>
    </div>
  )
}


function ToolbarDivider() {
  return <div className="w-px h-6 mx-1.5" style={{ background: 'var(--hp-border)' }} />
}


function ToolbarButton({ title, onClick, active, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="w-8 h-8 rounded-md flex items-center justify-center border transition-colors disabled:opacity-40"
      style={{
        background:  active ? `${ACCENT}15` : 'transparent',
        borderColor: active ? ACCENT       : 'transparent',
        color:       active ? ACCENT       : 'var(--hp-subtext)',
      }}
      onMouseEnter={e => { if (!active && !disabled) e.currentTarget.style.borderColor = 'var(--hp-border)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = 'transparent' }}
    >
      {children}
    </button>
  )
}


function ExportButton({
  allNodes, subgraph, lineageData, focusedNode,
  showExportMenu, setShowExportMenu,
  exportOptions, setExportOptions,
  exportScope, setExportScope,
}) {
  function openMenu() {
    if (showExportMenu) { setShowExportMenu(false); return }
    const opts = [{ key: 'full', label: `Graphe complet (${allNodes.length}n)` }]
    if (subgraph && focusedNode) opts.push({ key: 'subgraph', label: `${focusedNode.label} (${subgraph.nodes.length}n)` })
    setExportOptions(opts)
    setExportScope(subgraph && focusedNode ? 'subgraph' : 'full')
    setShowExportMenu(true)
  }

  return (
    <div className="relative">
      <ToolbarButton title="Télécharger" onClick={openMenu} active={showExportMenu}>
        <Download size={16} />
      </ToolbarButton>
      {showExportMenu && (() => {
        const src    = exportScope === 'subgraph' && subgraph ? subgraph : lineageData
        const prefix = exportScope === 'subgraph' && focusedNode ? focusedNode.label.replace(/\s+/g, '_') : 'lineage'
        function dl(blob, name) { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u) }
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
            <div className="absolute right-0 top-full mt-1 z-50 w-52 rounded-lg border shadow-lg overflow-hidden"
              style={{ background: 'var(--hp-header-bg)', borderColor: 'var(--hp-border)' }}>

              {exportOptions.length > 1 && (
                <div className="flex items-center gap-0.5 p-1 border-b"
                  style={{ borderColor: 'var(--hp-border)' }}>
                  {exportOptions.map(o => (
                    <button key={o.key} onClick={() => setExportScope(o.key)}
                      className="flex-1 text-[10px] font-semibold px-2 py-1 rounded transition-colors truncate"
                      style={exportScope === o.key
                        ? { background: ACCENT, color: 'white' }
                        : { color: 'var(--hp-subtext)' }}>
                      {o.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="py-1">
                {[
                  { label: 'JSON', fn: () => {
                    dl(new Blob([JSON.stringify({ exported_at: new Date().toISOString(), nodes: src.nodes, edges: src.edges }, null, 2)], { type: 'application/json' }), `${prefix}.json`)
                  }},
                  { label: 'CSV (nœuds)', fn: () => {
                    const rows = src.nodes.map(n => [n.id, n.label, n.type, n.stage ?? '', n.sheet ?? ''].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
                    dl(new Blob(['id,label,type,stage,sheet\n' + rows], { type: 'text/csv' }), `${prefix}_nodes.csv`)
                  }},
                  { label: 'CSV (arêtes)', fn: () => {
                    const rows = src.edges.map(e => [e.source, e.target, e.action ?? ''].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
                    dl(new Blob(['source,target,action\n' + rows], { type: 'text/csv' }), `${prefix}_edges.csv`)
                  }},
                  { label: 'PNG (graphe)', fn: async () => {
                    const viewport = document.querySelector('.react-flow__viewport')
                    if (!viewport) return
                    const { toPng } = await import('html-to-image')
                    const dataUrl = await toPng(viewport, {
                      backgroundColor: getComputedStyle(document.body).backgroundColor || '#ffffff',
                      pixelRatio: 2,
                      cacheBust: true,
                    })
                    const a = document.createElement('a')
                    a.href = dataUrl
                    a.download = `${prefix}.png`
                    a.click()
                  }},
                ].map(({ label, fn }) => (
                  <button key={label} onClick={() => { fn(); setShowExportMenu(false) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium transition-colors text-left"
                    style={{ color: 'var(--hp-text)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover, rgba(0,0,0,0.04))'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )
      })()}
    </div>
  )
}


function CanvasPlaceholder({ nodeCount }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-app-dim gap-3 pointer-events-none">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
          <Database size={18} className="text-blue-300" />
        </div>
        <div className="w-5 h-px bg-app-border" />
        <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
          <GitMerge size={18} className="text-amber-300" />
        </div>
        <div className="w-5 h-px bg-app-border" />
        <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
          <BarChart3 size={18} className="text-emerald-300" />
        </div>
      </div>
      <p className="text-sm font-medium text-app-muted">Sélectionnez un nœud pour explorer son lignage</p>
      <p className="text-xs text-app-dim">{nodeCount} nœuds chargés — choisissez-en un dans le panneau</p>
    </div>
  )
}

// ── Graph page ────────────────────────────────────────────────────────────────
export default function GraphPage({ sessionId, nodeId, navigate, goBack }) {
  const [lineageData, setLineageData]   = useState(null)
  const [focusedNode, setFocusedNode]   = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [drawerNode, setDrawerNode]     = useState(null)
  const [restoring, setRestoring]       = useState(true)
  const [error, setError]               = useState(null)
  const [warnings, setWarnings]         = useState([])
  const [viewMode, setViewMode]         = useState('simplified')
  const [showModal, setShowModal]       = useState(false)
  const [uploading, setUploading]       = useState(false)
  const [uploadError, setUploadError]   = useState(null)
  const [drawerOpen, setDrawerOpen]     = useState(false)
  const [hideHierarchy, setHideHierarchy] = useState(false)
  const [insightIds, setInsightIds]       = useState(null)
  const [searchOpen, setSearchOpen]       = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [exportScope, setExportScope]       = useState('full')   // 'full' | 'subgraph'
  const [exportOptions, setExportOptions]   = useState([])       // built on menu open

  useEffect(() => {
    setRestoring(true); setFocusedNode(null)
    setSelectedNode(null); setDrawerNode(null); setError(null); setWarnings([]); setDrawerOpen(false)
    // Keep previous lineageData so the left panel stays mounted during loading

    if (!sessionId) {
      // Auto-load the full catalog
      axios.post('/api/catalog/graph/', {})
        .then(({ data }) => navigate(`/graph/${data.session_id}`))
        .catch(() => { setLineageData(null); setRestoring(false) })
      return
    }

    axios.get('/api/session/', { headers: { 'X-Session-ID': sessionId } })
      .then(({ data }) => {
        if (data.nodes?.length) {
          setLineageData(data)
          saveRecentSession(sessionId, data.nodes.length, data.name ?? null)
        } else { setLineageData(null); setError('Session trouvée mais sans nœuds.') }
      })
      .catch(() => { setLineageData(null); setError('Impossible de charger ce graphe. Il a peut-être expiré.') })
      .finally(() => setRestoring(false))
  }, [sessionId])

  // Pick the node to focus when the session loads — URL ?node= wins, else
  // fall back to the seed the session was built around (for sessions created
  // via /api/catalog/graph/?node_id=, like the ODI scenario subgraphs).
  useEffect(() => {
    if (!lineageData) return
    const targetId = nodeId || lineageData.seed_node_id
    if (!targetId) { setFocusedNode(null); return }
    const found = lineageData.nodes.find(n => n.id === targetId)
    if (found) {
      setFocusedNode(found)
      setViewMode(TRANSFO_TYPES.has(found.type) ? 'complete' : 'simplified')
      setDrawerNode(prev => prev ? found : null)
    }
  }, [lineageData, nodeId])


  const { showSuggestions, openSuggestions, closeSuggestions } =
    useSuggestionsState({ drawerNode, setDrawerNode, setDrawerOpen })

  useEffect(() => {
    if (!focusedNode && !showSuggestions && !drawerNode) { setDrawerOpen(false) }
  }, [focusedNode, showSuggestions, drawerNode])

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(o => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Keep URL in sync with the focused node.
  // pushState so the browser back button navigates between previously viewed nodes.
  // The equality guard prevents duplicate entries on initial URL restore.
  useEffect(() => {
    if (!sessionId) return
    const base = `/graph/${sessionId}`
    const target = focusedNode ? `${base}?node=${focusedNode.id}` : base
    if (target !== window.location.pathname + window.location.search) {
      window.history.pushState(null, '', target)
    }
  }, [focusedNode, sessionId])

  const fullSubgraph = useMemo(() => {
    if (!focusedNode || !lineageData) return null
    return getSubgraph(focusedNode.id, lineageData.nodes, lineageData.edges)
  }, [focusedNode, lineageData])

  const isTransfoNode = focusedNode && TRANSFO_TYPES.has(focusedNode.type)
  const showToggle    = !!focusedNode && !isTransfoNode

  const HIERARCHY_TYPES = new Set(['feature', 'component'])

  // Insight-driven subgraph: compute getSubgraph for each insight node, merge results
  const insightSubgraph = useMemo(() => {
    if (!insightIds || !lineageData) return null
    const mergedNodes = new Map()
    const mergedEdges = new Map()
    for (const id of insightIds) {
      if (!lineageData.nodes.find(n => n.id === id)) continue
      const sg = getSubgraph(id, lineageData.nodes, lineageData.edges)
      sg.nodes.forEach(n => mergedNodes.set(n.id, n))
      sg.edges.forEach(e => mergedEdges.set(`${e.source}→${e.target}`, e))
    }
    return { nodes: [...mergedNodes.values()], edges: [...mergedEdges.values()] }
  }, [insightIds, lineageData])

  const subgraph = useMemo(() => {
    if (insightSubgraph) return insightSubgraph
    if (!fullSubgraph) return null
    let sg = (isTransfoNode || viewMode === 'complete') ? fullSubgraph : simplifySubgraph(fullSubgraph)
    if (hideHierarchy) {
      const filteredNodes = sg.nodes.filter(n => !HIERARCHY_TYPES.has(n.type))
      const filteredIds   = new Set(filteredNodes.map(n => n.id))
      sg = { nodes: filteredNodes, edges: sg.edges.filter(e => filteredIds.has(e.source) && filteredIds.has(e.target)) }
    }
    return sg
  }, [insightSubgraph, fullSubgraph, viewMode, isTransfoNode, hideHierarchy])

  async function handleUpload(files) {
    setUploading(true); setUploadError(null)
    const formData = new FormData()
    files.forEach(f => formData.append('file', f))
    try {
      await axios.post('/api/catalog/import/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setShowModal(false)
      // Reload full catalog as a new session
      const { data } = await axios.post('/api/catalog/graph/', {})
      navigate(`/graph/${data.session_id}`)
    } catch (err) {
      setUploadError(err.response?.data?.error ?? 'Erreur lors de l\'import.')
    } finally {
      setUploading(false)
    }
  }

  async function swapToSource(next) {
    if (next === (lineageData?.source || 'dc')) return
    try { localStorage.setItem(SOURCE_KEY, next) } catch {}
    try {
      const { data } = await axios.post('/api/catalog/graph/', { source: next })
      navigate(`/graph/${data.session_id}`)
    } catch {
      // swap silently aborted — current graph stays
    }
  }

  const allNodes = lineageData?.nodes ?? []
  const allEdges = lineageData?.edges ?? []
  const isInitializing = restoring && !lineageData  // true only on very first load

  return (
    <div className="flex flex-col h-screen bg-app-bg">
      {/* Consolidated toolbar — single bar, clear left/center/right groups */}
      <header className="flex items-center gap-2 px-5 border-b z-10 shrink-0"
        style={{ borderTop: `3px solid ${ACCENT}`, borderBottomColor: 'var(--hp-border)', background: 'var(--hp-header-bg)', backdropFilter: 'blur(10px)', minHeight: 56 }}>

        <button onClick={() => navigate('/')}
          className="flex items-center gap-2.5 shrink-0 hover:opacity-80 transition-opacity">
          <div style={{
            width: 30, height: 30, borderRadius: 7, background: ACCENT,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 15, color: 'white', flexShrink: 0,
          }}>N</div>
          <div className="text-left">
            <p className="text-sm font-bold leading-none" style={{ color: 'var(--hp-text)' }}>Nexus</p>
            <p className="text-[9px] font-semibold tracking-widest leading-none mt-0.5 uppercase" style={{ color: ACCENT }}>Explorer</p>
          </div>
        </button>

        {lineageData && (
          <>
            <ToolbarDivider />
            <SourceToggle source={lineageData.source || 'dc'} onChange={swapToSource} />
          </>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {lineageData && !isInitializing && (
            <>
              <ToolbarButton
                title={`Rechercher (${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl+'}K)`}
                onClick={() => setSearchOpen(o => !o)}
                active={searchOpen}
              >
                <Search size={16} />
              </ToolbarButton>

              {focusedNode && (
                <>
                  <ToolbarButton
                    title={hideHierarchy ? 'Afficher la hiérarchie' : 'Masquer la hiérarchie'}
                    onClick={() => setHideHierarchy(h => !h)}
                    active={hideHierarchy}
                  >
                    {hideHierarchy ? <EyeOff size={16} /> : <Eye size={16} />}
                  </ToolbarButton>

                  {showToggle && (
                    <div className="flex items-center gap-0.5 rounded-md p-0.5 border"
                      style={{ borderColor: 'var(--hp-border)' }}>
                      {['simplified', 'complete'].map(mode => (
                        <button key={mode} onClick={() => setViewMode(mode)}
                          title={mode === 'simplified' ? 'Vue simplifiée' : 'Vue complète'}
                          className="px-2.5 py-1 rounded text-[11px] font-semibold transition-colors"
                          style={viewMode === mode
                            ? { background: ACCENT, color: 'white' }
                            : { color: 'var(--hp-subtext)' }}>
                          {mode === 'simplified' ? 'Simplifié' : 'Complet'}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              <ToolbarDivider />

              <ToolbarButton
                title="Importer"
                onClick={() => { setUploadError(null); setShowModal(true) }}
              >
                <UploadCloud size={16} />
              </ToolbarButton>

              <ExportButton
                allNodes={allNodes}
                subgraph={subgraph}
                lineageData={lineageData}
                focusedNode={focusedNode}
                showExportMenu={showExportMenu}
                setShowExportMenu={setShowExportMenu}
                exportOptions={exportOptions}
                setExportOptions={setExportOptions}
                exportScope={exportScope}
                setExportScope={setExportScope}
              />

              <ToolbarDivider />

              <ToolbarButton
                title={drawerOpen ? 'Fermer le panneau' : 'Ouvrir le panneau'}
                onClick={() => setDrawerOpen(d => !d)}
                active={drawerOpen}
              >
                {drawerOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              </ToolbarButton>
            </>
          )}
          <DarkModeToggle />
        </div>
      </header>

      {/* Body: left panel + canvas */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* No session: show catalog browser */}
        {!sessionId && !restoring && (
          <>
            <CatalogBrowser navigate={navigate} />
            <div className="flex-1 flex items-center justify-center text-app-muted flex-col gap-3">
              <BarChart3 size={36} className="text-app-dim" />
              <p className="text-sm text-app-muted">Sélectionnez un nœud pour visualiser son lignage</p>
            </div>
          </>
        )}

        {isInitializing && (
          <div className="absolute inset-0 flex items-center justify-center gap-3 text-app-muted z-10 bg-app-bg">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Chargement du graphe…</span>
          </div>
        )}

        {error && !restoring && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-app-muted z-10 bg-app-bg">
            <div className="text-5xl">⚠️</div>
            <p className="text-sm text-app-subtext max-w-sm text-center">{error}</p>
            <button onClick={goBack}
              className="text-xs font-medium px-4 py-2 rounded-lg border border-app-border text-app-text hover:bg-app-hover">
              ← Retour à l'accueil
            </button>
          </div>
        )}

        {lineageData && !isInitializing && (
          <>
            <NodeSelector
              nodes={allNodes}
              edges={allEdges}
              selectedNodeId={focusedNode?.id}
              onSelect={node => {
                if (showSuggestions) { window.history.back() }
                setInsightIds(null); setFocusedNode(node); setSelectedNode(null); setDrawerNode(drawerOpen ? node : null); setViewMode(TRANSFO_TYPES.has(node.type) ? 'complete' : 'simplified')
              }}
            />

            <div className="flex-1 relative overflow-hidden">
              {restoring && (
                <div className="absolute inset-0 flex items-center justify-center gap-3 text-app-muted z-10 bg-app-bg/80">
                  <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">Chargement du graphe…</span>
                </div>
              )}
              {!subgraph && !restoring && <CanvasPlaceholder nodeCount={allNodes.length} />}

              {focusedNode && (
                <FocusBreadcrumb
                  source={lineageData?.source || 'dc'}
                  focusedNode={focusedNode}
                  subgraphCount={subgraph?.nodes?.length ?? 0}
                  totalCount={allNodes.length}
                />
              )}

              <GlobalSearch
                isOpen={searchOpen}
                onClose={() => setSearchOpen(false)}
                nodes={subgraph?.nodes ?? allNodes}
                onSelect={node => {
                  setFocusedNode(node)
                  setDrawerNode(node)
                  setDrawerOpen(true)
                }}
              />

              {subgraph && subgraph.nodes.length > 0 && (
                <LineageGraph
                  nodes={subgraph.nodes}
                  edges={subgraph.edges}
                  onNodeClick={node => {
                    if (showSuggestions) { window.history.back() }
                    setSelectedNode(node); setDrawerNode(node); setDrawerOpen(true)
                  }}
                  onDropdownItemClick={item => { setSelectedNode(null); setDrawerNode(item); setDrawerOpen(true) }}
                  onPaneClick={() => { setSelectedNode(null); setDrawerNode(null); if (!showSuggestions) setDrawerOpen(false) }}
                  selectedNodeId={selectedNode?.id}
                  insightIds={insightIds}
                  drawerOpen={drawerOpen}
                />
              )}

              {subgraph && subgraph.nodes.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-app-muted">
                  <p className="text-sm">Aucun nœud connecté trouvé</p>
                </div>
              )}
            </div>

            <NodeDrawer
              node={drawerNode}
              nodes={allNodes}
              edges={allEdges}
              isOpen={drawerOpen}
              onClose={() => setDrawerOpen(false)}
              onNavigate={node => {
                                setDrawerNode(node)
                const found = allNodes.find(n => n.id === node.id)
                if (found) setFocusedNode(found)
              }}
              onHighlight={ids => { setInsightIds(new Set(ids)); setFocusedNode(null); setDrawerNode(null) }}
              showSuggestions={showSuggestions}
              onOpenSuggestions={openSuggestions}
              onCloseSuggestions={() => { window.history.back(); closeSuggestions() }}
              sessionId={sessionId}
            />
          </>
        )}
      </div>

      {showModal && (
        <UploadModal
          catalogMode
          onUpload={handleUpload}
          loading={uploading}
          error={uploadError}
          onClose={() => !uploading && setShowModal(false)}
        />
      )}

    </div>
  )
}
