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

const ACCENT = '#88c648'
const TRANSFO_TYPES = new Set(['ingest', 'compute', 'virtual', 'extract', 'collection', 'transformation'])

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
function CanvasPlaceholder({ nodeCount }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 gap-3 pointer-events-none">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
          <Database size={18} className="text-blue-300" />
        </div>
        <div className="w-5 h-px bg-slate-200" />
        <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
          <GitMerge size={18} className="text-amber-300" />
        </div>
        <div className="w-5 h-px bg-slate-200" />
        <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
          <BarChart3 size={18} className="text-emerald-300" />
        </div>
      </div>
      <p className="text-sm font-medium text-slate-400">Sélectionnez un nœud pour explorer son lignage</p>
      <p className="text-xs text-slate-300">{nodeCount} nœuds chargés — choisissez-en un dans le panneau</p>
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
  const [refreshing, setRefreshing]     = useState(false)
  const [hideHierarchy, setHideHierarchy] = useState(false)
  const [insightIds, setInsightIds]       = useState(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
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

  // Restore focused node from URL — also clears it when nodeId is absent (browser back)
  useEffect(() => {
    if (!lineageData) return
    if (!nodeId) { setFocusedNode(null); return }
    const found = lineageData.nodes.find(n => n.id === nodeId)
    if (found) {
      setFocusedNode(found)
      setViewMode(TRANSFO_TYPES.has(found.type) ? 'complete' : 'simplified')
      // Keep drawer in sync: if drawer was open, update it to the restored node
      setDrawerNode(prev => prev ? found : null)
    }
  }, [lineageData, nodeId])


  // Close drawer when no graph is open
  useEffect(() => {
    if (!focusedNode && !showSuggestions) { setDrawerNode(null); setDrawerOpen(false) }
  }, [focusedNode, showSuggestions])

  // Open suggestions panel with history entry
  function openSuggestions() {
    setShowSuggestions(true)
    setDrawerNode(null)
    setDrawerOpen(true)
    window.history.pushState({ suggestions: true }, '')
  }

  // Close suggestions and go back in history
  function closeSuggestions() {
    setShowSuggestions(false)
  }

  // Listen for popstate to close suggestions on browser back
  useEffect(() => {
    function onPop(e) {
      if (showSuggestions) {
        setShowSuggestions(false)
        e.stopImmediatePropagation?.()
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [showSuggestions])

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

  async function handleCatalogRefresh() {
    if (!lineageData?.seed_node_id) return
    setRefreshing(true)
    try {
      const { data } = await axios.post('/api/catalog/graph/', { node_id: lineageData.seed_node_id })
      navigate(`/graph/${data.session_id}`)
    } catch {
      // silently ignore — graph stays as-is
    } finally {
      setRefreshing(false)
    }
  }

  const allNodes = lineageData?.nodes ?? []
  const allEdges = lineageData?.edges ?? []
  const isInitializing = restoring && !lineageData  // true only on very first load

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Top bar */}
      <header className="flex items-center gap-3 px-6 py-3 border-b z-10 shrink-0"
        style={{ borderTop: `3px solid ${ACCENT}`, borderBottomColor: 'var(--hp-border)', background: 'var(--hp-header-bg)', backdropFilter: 'blur(10px)' }}>

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

        {lineageData && (
          <div className="flex items-center gap-2 text-[11px] text-slate-500 ml-1">
            <span className="bg-slate-100 px-2 py-0.5 rounded-full font-medium">{allNodes.length} nœuds</span>
            <span className="bg-slate-100 px-2 py-0.5 rounded-full font-medium">{allEdges.length} arêtes</span>
            {focusedNode && (
              <span className="px-2 py-0.5 rounded-full font-medium"
                style={{ color: ACCENT, background: 'var(--accent-pill-bg)', border: '1px solid var(--accent-pill-border)' }}>
                {focusedNode.label}
              </span>
            )}
          </div>
        )}

        {/* Right-side actions — global only */}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => { setUploadError(null); setShowModal(true) }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-white shadow-sm transition-colors"
            style={{ background: ACCENT }}
            onMouseEnter={e => e.currentTarget.style.background = '#6aaf35'}
            onMouseLeave={e => e.currentTarget.style.background = ACCENT}>
            <UploadCloud size={13} /> Importer
          </button>
          <DarkModeToggle />
        </div>
      </header>

      {/* Sub-bar — clean contextual actions */}
      {lineageData && !isInitializing && (
        <div className="flex items-center px-4 shrink-0 border-b"
          style={{ background: 'var(--hp-header-bg)', borderColor: 'var(--hp-border)', minHeight: 36 }}>

          <div className="ml-auto flex items-center gap-1 relative">
            {/* Export dropdown — attached below the button */}
            <div className="relative">
              <button
                onClick={() => {
                  if (showExportMenu) { setShowExportMenu(false); return }
                  const opts = [{ key: 'full', label: `Graphe complet (${allNodes.length}n)` }]
                  if (subgraph && focusedNode) opts.push({ key: 'subgraph', label: `${focusedNode.label} (${subgraph.nodes.length}n)` })
                  setExportOptions(opts)
                  setExportScope(subgraph && focusedNode ? 'subgraph' : 'full')
                  setShowExportMenu(true)
                }}
                className="peer w-7 h-7 rounded flex items-center justify-center border transition-colors"
                style={{ background: showExportMenu ? 'var(--hp-search-bg)' : 'transparent', borderColor: showExportMenu ? 'var(--hp-border)' : 'transparent', color: 'var(--hp-text-muted, #94a3b8)' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--hp-border)'}
                onMouseLeave={e => { if (!showExportMenu) e.currentTarget.style.borderColor = 'transparent' }}
              >
                <Download size={13} />
              </button>
              {!showExportMenu && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 px-2 py-1 rounded text-[10px] font-medium text-white whitespace-nowrap pointer-events-none opacity-0 peer-hover:opacity-100 transition-opacity"
                  style={{ background: '#1e293b' }}>
                  Télécharger
                </div>
              )}
              {showExportMenu && (() => {
                const src = exportScope === 'subgraph' && subgraph ? subgraph : lineageData
                const prefix = exportScope === 'subgraph' && focusedNode ? focusedNode.label.replace(/\s+/g, '_') : 'lineage'
                function dl(blob, name) { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u) }
                return (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                    <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-lg border shadow-lg overflow-hidden"
                      style={{ background: 'var(--hp-header-bg)', borderColor: 'var(--hp-border)' }}>

                      {/* Scope selector */}
                      {exportOptions.length > 1 && (
                        <div className="px-2 pt-2 pb-1">
                          <select value={exportScope} onChange={e => setExportScope(e.target.value)}
                            className="w-full text-[10px] font-medium rounded-md border px-2 py-1.5 outline-none"
                            style={{ background: 'var(--hp-search-bg)', borderColor: 'var(--hp-border)', color: 'var(--hp-text)' }}>
                            {exportOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                          </select>
                        </div>
                      )}
                      {exportOptions.length <= 1 && (
                        <div className="px-3 pt-2 pb-1">
                          <p className="text-[10px] font-medium" style={{ color: 'var(--hp-text-muted, #94a3b8)' }}>
                            {exportOptions[0]?.label ?? 'Graphe complet'}
                          </p>
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

            <div className="w-px h-4 mx-1 bg-slate-200" />

            <button
              onClick={() => setDrawerOpen(d => !d)}
              title={drawerOpen ? 'Fermer le panneau' : 'Ouvrir le panneau'}
              className="w-7 h-7 rounded flex items-center justify-center border transition-colors"
              style={{ background: 'transparent', borderColor: 'transparent', color: 'var(--hp-text-muted, #94a3b8)' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--hp-border)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
            >
              {drawerOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>
          </div>
        </div>
      )}

      {/* Body: left panel + canvas */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* No session: show catalog browser */}
        {!sessionId && !restoring && (
          <>
            <CatalogBrowser navigate={navigate} />
            <div className="flex-1 flex items-center justify-center text-slate-400 flex-col gap-3">
              <BarChart3 size={36} className="text-slate-200" />
              <p className="text-sm text-slate-400">Sélectionnez un nœud pour visualiser son lignage</p>
            </div>
          </>
        )}

        {isInitializing && (
          <div className="absolute inset-0 flex items-center justify-center gap-3 text-slate-400 z-10 bg-slate-50">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Chargement du graphe…</span>
          </div>
        )}

        {error && !restoring && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-slate-400 z-10 bg-slate-50">
            <div className="text-5xl">⚠️</div>
            <p className="text-sm text-slate-500 max-w-sm text-center">{error}</p>
            <button onClick={goBack}
              className="text-xs font-medium px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
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
                if (showSuggestions) { window.history.back(); setShowSuggestions(false) }
                setInsightIds(null); setFocusedNode(node); setSelectedNode(null); setDrawerNode(drawerOpen ? node : null); setViewMode(TRANSFO_TYPES.has(node.type) ? 'complete' : 'simplified')
              }}
            />

            <div className="flex-1 relative overflow-hidden">
              {restoring && (
                <div className="absolute inset-0 flex items-center justify-center gap-3 text-slate-400 z-10 bg-slate-50/80">
                  <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">Chargement du graphe…</span>
                </div>
              )}
              {!subgraph && !restoring && <CanvasPlaceholder nodeCount={allNodes.length} />}

              {focusedNode && (
                <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
                  {/* Hide hierarchy toggle */}
                  <button onClick={() => setHideHierarchy(h => !h)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border shadow-sm text-[11px] font-semibold transition-all"
                    style={hideHierarchy
                      ? { background: ACCENT, color: 'white', borderColor: ACCENT }
                      : { background: 'var(--tab-active-bg)', borderColor: 'var(--hp-border)', color: '#94A3B8' }}>
                    {hideHierarchy ? <EyeOff size={12} /> : <Eye size={12} />}
                    Hiérarchie
                  </button>

                  {/* Simplified / Complete toggle */}
                  {showToggle && (
                    <div className="flex items-center gap-0.5 border rounded-lg p-0.5 shadow-sm"
                      style={{ background: 'var(--tab-active-bg)', borderColor: 'var(--hp-border)' }}>
                      {['simplified', 'complete'].map(mode => (
                        <button key={mode} onClick={() => setViewMode(mode)}
                          className="px-3 py-1 rounded-md text-[11px] font-semibold transition-all"
                          style={viewMode === mode ? { background: ACCENT, color: 'white' } : { color: '#94A3B8' }}>
                          {mode === 'simplified' ? 'Simplifié' : 'Complet'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}



              {subgraph && subgraph.nodes.length > 0 && (
                <LineageGraph
                  nodes={subgraph.nodes}
                  edges={subgraph.edges}
                  onNodeClick={node => {
                    if (showSuggestions) { window.history.back(); setShowSuggestions(false) }
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
                <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                  <p className="text-sm">Aucun nœud connecté trouvé</p>
                </div>
              )}
            </div>

            <NodeDrawer
              node={drawerNode}
              nodes={allNodes}
              edges={allEdges}
              isOpen={drawerOpen}
              onClose={() => { setDrawerOpen(false); setRemovedDrawer(null) }}
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
