import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import LineageGraph from '../components/LineageGraph.jsx'
import NodeDrawer from '../components/NodeDrawer.jsx'
import NodeSelector from '../components/NodeSelector.jsx'
import UploadModal from '../components/UploadModal.jsx'
import { getSubgraph } from '../lib/graphUtils.js'
import { Upload, ArrowLeft, BarChart3, GitMerge, Database, Download } from 'lucide-react'

const ACCENT = '#FF7327'

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
      <p className="text-sm font-medium text-slate-400">Select a node to explore its lineage</p>
      <p className="text-xs text-slate-300">{nodeCount} nodes loaded — pick one from the panel</p>
    </div>
  )
}

// ── Graph page ────────────────────────────────────────────────────────────────
export default function GraphPage({ sessionId, nodeId, navigate, goBack }) {
  const [lineageData, setLineageData]   = useState(null)
  const [focusedNode, setFocusedNode]   = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [restoring, setRestoring]       = useState(true)
  const [error, setError]               = useState(null)
  const [warnings, setWarnings]         = useState([])
  const [showModal, setShowModal]       = useState(false)
  const [uploading, setUploading]       = useState(false)
  const [uploadError, setUploadError]   = useState(null)

  useEffect(() => {
    setRestoring(true); setLineageData(null); setFocusedNode(null)
    setSelectedNode(null); setError(null); setWarnings([])

    axios.get('/api/session/', { headers: { 'X-Session-ID': sessionId } })
      .then(({ data }) => {
        if (data.nodes?.length) setLineageData(data)
        else setError('Session found but contains no nodes.')
      })
      .catch(() => setError('Could not load this graph. It may have expired.'))
      .finally(() => setRestoring(false))
  }, [sessionId])

  // Restore focused node from URL — also clears it when nodeId is absent (browser back)
  useEffect(() => {
    if (!lineageData) return
    if (!nodeId) { setFocusedNode(null); return }
    const found = lineageData.nodes.find(n => n.id === nodeId)
    if (found) setFocusedNode(found)
  }, [lineageData, nodeId])

  // Keep URL in sync with the focused node
  useEffect(() => {
    const base = `/graph/${sessionId}`
    navigate(focusedNode ? `${base}?node=${focusedNode.id}` : base)
  }, [focusedNode, sessionId])

  const subgraph = useMemo(() => {
    if (!focusedNode || !lineageData) return null
    return getSubgraph(focusedNode.id, lineageData.nodes, lineageData.edges)
  }, [focusedNode, lineageData])

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
  const isInitializing = restoring && !lineageData

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Top bar */}
      <header className="flex items-center gap-3 px-4 py-2 bg-white border-b border-slate-200 shadow-sm z-10 flex-wrap shrink-0"
        style={{ borderTop: `3px solid ${ACCENT}` }}>

        <button onClick={goBack}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800
            px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors shrink-0">
          <ArrowLeft size={13} strokeWidth={2.5} /> Home
        </button>

        <button onClick={() => navigate('/')}
          className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity">
          <div style={{
            width: 26, height: 26, borderRadius: 7, background: ACCENT,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 13, color: 'white',
          }}>M</div>
          <span className="text-sm font-bold text-slate-900 hidden sm:block">Modeo Lineage</span>
        </button>

        {lineageData && (
          <div className="flex items-center gap-2 text-[11px] text-slate-500 ml-1">
            <span className="bg-slate-100 px-2 py-0.5 rounded-full font-medium">{allNodes.length} nodes</span>
            <span className="bg-slate-100 px-2 py-0.5 rounded-full font-medium">{allEdges.length} edges</span>
            {focusedNode && (
              <span className="px-2 py-0.5 rounded-full font-medium"
                style={{ color: ACCENT, background: '#FFF4EE', border: '1px solid #FFD4B8' }}>
                {focusedNode.label}
              </span>
            )}
          </div>
        )}

        {lineageData && (
          <button
            onClick={() => {
              const payload = {
                session_id: sessionId,
                exported_at: new Date().toISOString(),
                mode: lineageData.mode,
                nodes: lineageData.nodes,
                edges: lineageData.edges,
              }
              const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `lineage-${sessionId}.json`
              a.click()
              URL.revokeObjectURL(url)
            }}
            className="ml-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            <Download size={13} /> Export JSON
          </button>
        )}

        <button onClick={() => { setUploadError(null); setShowModal(true) }}
          className={`${lineageData ? '' : 'ml-auto'} inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-white shadow-sm transition-colors`}
          style={{ background: ACCENT }}
          onMouseEnter={e => e.currentTarget.style.background = '#E5601A'}
          onMouseLeave={e => e.currentTarget.style.background = ACCENT}>
          <Upload size={13} /> New graph
        </button>
      </header>

      {warnings.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-2 flex items-center gap-2 text-xs text-amber-700 shrink-0">
          <span>⚠️</span><span>{warnings.join(' · ')}</span>
          <button onClick={() => setWarnings([])} className="ml-auto text-amber-400 hover:text-amber-600">✕</button>
        </div>
      )}

      {/* Body: left panel + canvas */}
      <div className="flex-1 flex overflow-hidden relative">

        {isInitializing && (
          <div className="absolute inset-0 flex items-center justify-center gap-3 text-slate-400 z-10 bg-slate-50">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Loading graph…</span>
          </div>
        )}

        {error && !isInitializing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-slate-400 z-10 bg-slate-50">
            <div className="text-5xl">⚠️</div>
            <p className="text-sm text-slate-500 max-w-sm text-center">{error}</p>
            <button onClick={goBack}
              className="text-xs font-medium px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
              ← Back to home
            </button>
          </div>
        )}

        {lineageData && !isInitializing && (
          <>
            <NodeSelector
              nodes={allNodes}
              edges={allEdges}
              selectedNodeId={focusedNode?.id}
              onSelect={node => { setFocusedNode(node); setSelectedNode(null) }}
            />

            <div className="flex-1 relative overflow-hidden">
              {!subgraph && <CanvasPlaceholder nodeCount={allNodes.length} />}

              {subgraph && subgraph.nodes.length > 0 && (
                <LineageGraph
                  nodes={subgraph.nodes}
                  edges={subgraph.edges}
                  onNodeClick={setSelectedNode}
                  onPaneClick={() => setSelectedNode(null)}
                  selectedNodeId={selectedNode?.id}
                />
              )}

              {subgraph && subgraph.nodes.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                  <p className="text-sm">No connected nodes found</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <NodeDrawer
        node={selectedNode}
        nodes={allNodes}
        edges={allEdges}
        onClose={() => setSelectedNode(null)}
        onNavigate={node => {
          setSelectedNode(node)
          const found = allNodes.find(n => n.id === node.id)
          if (found) setFocusedNode(found)
        }}
        sessionId={sessionId}
      />

      {showModal && (
        <UploadModal
          onUpload={handleUpload}
          loading={uploading}
          error={uploadError}
          onClose={() => !uploading && setShowModal(false)}
        />
      )}
    </div>
  )
}
