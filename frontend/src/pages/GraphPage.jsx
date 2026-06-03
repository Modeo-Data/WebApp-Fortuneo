import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import LineageGraph from '../components/LineageGraph.jsx'
import NodeDrawer from '../components/NodeDrawer.jsx'
import NodeSelector from '../components/NodeSelector.jsx'
import UploadModal from '../components/UploadModal.jsx'
import DiffPicker, { saveRecentSession } from '../components/DiffPicker.jsx'
import { getSubgraph, simplifySubgraph } from '../lib/graphUtils.js'
import { computeDiff } from '../lib/diffUtils.js'
import { Upload, BarChart3, GitMerge, Database, Download, Diff, X, Link, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import DarkModeToggle from '../components/DarkModeToggle.jsx'

const ACCENT = '#88c648'


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
  const [showDiffPicker, setShowDiffPicker] = useState(false)
  const [diffBase, setDiffBase]         = useState(null) // { sessionId, nodes, edges }
  const [removedDrawer, setRemovedDrawer] = useState(null) // node from base shown in drawer
  const [copied, setCopied]             = useState(false)
  const [drawerOpen, setDrawerOpen]         = useState(false)

  useEffect(() => {
    setRestoring(true); setFocusedNode(null)
    setSelectedNode(null); setDrawerNode(null); setError(null); setWarnings([]); setDrawerOpen(false)
    // Keep previous lineageData so the left panel stays mounted during loading

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
      setViewMode(found.type === 'transformation' ? 'complete' : 'simplified')
      // Keep drawer in sync: if drawer was open, update it to the restored node
      setDrawerNode(prev => prev ? found : null)
    }
  }, [lineageData, nodeId])


  // Close drawer when no graph is open
  useEffect(() => {
    if (!focusedNode) { setDrawerNode(null); setRemovedDrawer(null); setDrawerOpen(false) }
  }, [focusedNode])

  // Keep URL in sync with the focused node
  useEffect(() => {
    const base = `/graph/${sessionId}`
    navigate(focusedNode ? `${base}?node=${focusedNode.id}` : base)
  }, [focusedNode, sessionId])

  const fullSubgraph = useMemo(() => {
    if (!focusedNode || !lineageData) return null
    return getSubgraph(focusedNode.id, lineageData.nodes, lineageData.edges)
  }, [focusedNode, lineageData])

  const showToggle = focusedNode && focusedNode.type !== 'transformation'

  const subgraph = useMemo(() => {
    if (!fullSubgraph) return null
    if (!showToggle || viewMode === 'complete') return fullSubgraph
    return simplifySubgraph(fullSubgraph)
  }, [fullSubgraph, viewMode, showToggle])

  async function handleUpload(files, mode, name) {
    setUploading(true); setUploadError(null)
    const formData = new FormData()
    files.forEach(f => formData.append('file', f))
    formData.append('mode', mode)
    if (name) formData.append('name', name)
    try {
      const { data } = await axios.post('/api/upload/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setShowModal(false)
      navigate(`/graph/${data.session_id}`)
    } catch (err) {
      setUploadError(err.response?.data?.error ?? 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const allNodes = lineageData?.nodes ?? []
  const allEdges = lineageData?.edges ?? []
  const isInitializing = restoring && !lineageData  // true only on very first load

  const diffResult = useMemo(
    () => diffBase ? computeDiff(allNodes, diffBase.nodes) : null,
    [allNodes, diffBase],
  )

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
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-white shadow-sm transition-colors"
            style={{ background: ACCENT }}
            onMouseEnter={e => e.currentTarget.style.background = '#6aaf35'}
            onMouseLeave={e => e.currentTarget.style.background = ACCENT}>
            <Upload size={13} /> Nouveau graphe
          </button>
          <DarkModeToggle />
        </div>
      </header>

      {/* Sub-bar — contextual actions, visible when a graph is loaded */}
      {lineageData && !isInitializing && (
        <div className="flex items-center px-4 shrink-0 border-b"
          style={{ background: 'var(--hp-header-bg)', borderColor: 'var(--hp-border)', minHeight: 36 }}>

          {/* Right: contextual actions */}
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => { navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium border transition-colors"
              style={{ background: 'transparent', borderColor: 'transparent', color: copied ? '#16a34a' : 'var(--hp-text-muted, #94a3b8)' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--hp-border)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
            >
              {copied ? <Check size={11} /> : <Link size={11} />}
              {copied ? 'Copié !' : 'Partager'}
            </button>

            <button
              onClick={() => {
                const payload = { session_id: sessionId, exported_at: new Date().toISOString(), mode: lineageData.mode, nodes: lineageData.nodes, edges: lineageData.edges }
                const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a'); a.href = url; a.download = `lineage-${sessionId}.json`; a.click()
                URL.revokeObjectURL(url)
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium border transition-colors"
              style={{ background: 'transparent', borderColor: 'transparent', color: 'var(--hp-text-muted, #94a3b8)' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--hp-border)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
            >
              <Download size={11} /> Exporter
            </button>

            <button
              onClick={() => diffBase ? setDiffBase(null) : setShowDiffPicker(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium border transition-colors"
              style={diffBase
                ? { background: '#fef3c7', borderColor: '#fcd34d', color: '#92400e' }
                : { background: 'transparent', borderColor: 'transparent', color: 'var(--hp-text-muted, #94a3b8)' }}
              onMouseEnter={e => { if (!diffBase) e.currentTarget.style.borderColor = 'var(--hp-border)' }}
              onMouseLeave={e => { if (!diffBase) e.currentTarget.style.borderColor = 'transparent' }}
            >
              <Diff size={11} />
              {diffBase ? 'Fin de comparaison' : 'Comparer'}
            </button>

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

      {warnings.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-2 flex items-center gap-2 text-xs text-amber-700 shrink-0">
          <span>⚠️</span><span>{warnings.join(' · ')}</span>
          <button onClick={() => setWarnings([])} className="ml-auto text-amber-400 hover:text-amber-600">✕</button>
        </div>
      )}

      {diffResult && (
        <div className="border-b px-5 py-2 flex items-center gap-3 text-xs shrink-0"
          style={{ background: '#fffbf0', borderColor: '#fcd34d' }}>
          <Diff size={13} style={{ color: '#d97706', flexShrink: 0 }} />
          <span className="font-semibold" style={{ color: '#92400e' }}>
            Comparaison activée
          </span>
          <span className="text-slate-400">·</span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
            <span style={{ color: '#15803d' }}>{diffResult.added.length} ajouté{diffResult.added.length !== 1 ? 's' : ''}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
            <span style={{ color: '#92400e' }}>{diffResult.changed.length} modifié{diffResult.changed.length !== 1 ? 's' : ''}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-slate-400" />
            <span className="text-slate-500">{diffResult.removed.length} supprimé{diffResult.removed.length !== 1 ? 's' : ''}</span>
          </span>
          {diffResult.removed.length > 0 && (
            <span className="text-slate-400 ml-1 truncate max-w-xs hidden sm:inline">
              ({diffResult.removed.map(n => n.label).join(', ')})
            </span>
          )}
          <button onClick={() => setDiffBase(null)} className="ml-auto text-slate-400 hover:text-slate-600 transition-colors">
            <X size={13} />
          </button>
        </div>
      )}

      {/* Body: left panel + canvas */}
      <div className="flex-1 flex overflow-hidden relative">

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
              onSelect={node => { setFocusedNode(node); setSelectedNode(null); setDrawerNode(drawerOpen ? node : null); setViewMode(node.type === 'transformation' ? 'complete' : 'simplified') }}
              onDiffSelect={node => { setRemovedDrawer(null); setFocusedNode(node); setSelectedNode(node); setDrawerNode(node); setDrawerOpen(true); setViewMode('simplified') }}
              onDiffRemoved={node => { setRemovedDrawer(node); setDrawerNode(node); setDrawerOpen(true) }}
              diffResult={diffResult}
            />

            <div className="flex-1 relative overflow-hidden">
              {restoring && (
                <div className="absolute inset-0 flex items-center justify-center gap-3 text-slate-400 z-10 bg-slate-50/80">
                  <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">Chargement du graphe…</span>
                </div>
              )}
              {!subgraph && !restoring && <CanvasPlaceholder nodeCount={allNodes.length} />}

              {showToggle && (
                <div className="absolute top-3 right-3 z-10 flex items-center gap-0.5 border rounded-lg p-0.5 shadow-sm"
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



              {subgraph && subgraph.nodes.length > 0 && (
                <LineageGraph
                  nodes={subgraph.nodes}
                  edges={subgraph.edges}
                  onNodeClick={node => { setSelectedNode(node); setDrawerNode(node); setDrawerOpen(true) }}
                  onDropdownItemClick={item => { setSelectedNode(null); setDrawerNode(item); setDrawerOpen(true) }}
                  onPaneClick={() => { setSelectedNode(null); setDrawerNode(null); setDrawerOpen(false) }}
                  selectedNodeId={selectedNode?.id}
                  diffStatusMap={diffResult?.statusMap ?? null}
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
              edgesOverride={removedDrawer ? diffBase?.edges : null}
              nodesOverride={removedDrawer ? diffBase?.nodes : null}
              isRemovedNode={!!removedDrawer}
              isOpen={drawerOpen}
              onClose={() => { setDrawerOpen(false); setRemovedDrawer(null) }}
              onNavigate={node => {
                setRemovedDrawer(null)
                setDrawerNode(node)
                const found = allNodes.find(n => n.id === node.id)
                if (found) setFocusedNode(found)
              }}
              sessionId={sessionId}
            />
          </>
        )}
      </div>

      {showModal && (
        <UploadModal
          onUpload={handleUpload}
          loading={uploading}
          error={uploadError}
          onClose={() => !uploading && setShowModal(false)}
        />
      )}

      {showDiffPicker && (
        <DiffPicker
          currentSessionId={sessionId}
          onSelect={base => { setDiffBase(base); setShowDiffPicker(false) }}
          onClose={() => setShowDiffPicker(false)}
        />
      )}
    </div>
  )
}
