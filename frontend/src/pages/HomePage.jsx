import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import UploadModal from '../components/UploadModal.jsx'
import { BarChart3, Clock, ChevronRight, Plus, Database, Bookmark, BookmarkCheck, FlaskConical } from 'lucide-react'
import DarkModeToggle from '../components/DarkModeToggle.jsx'

const ACCENT = '#88c648'

function fmt(iso) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso))
  } catch { return iso }
}

const MODE_COLOR = {
  formula:    { bg: 'var(--mode-formula-bg)',    text: 'var(--mode-formula-text)' },
  structured: { bg: 'var(--mode-structured-bg)', text: 'var(--mode-structured-text)' },
}

function GraphCard({ graph, onOpen, onSave, onUnsave, saved }) {
  const mc = MODE_COLOR[graph.mode] ?? { bg: '#F8FAFC', text: '#64748B' }
  const [busy, setBusy] = useState(false)

  async function toggleSave(e) {
    e.stopPropagation()
    setBusy(true)
    await (saved ? onUnsave(graph.session_id) : onSave(graph.session_id))
    setBusy(false)
  }

  return (
    <div className="w-full bg-white rounded-xl border border-slate-200 px-4 py-3.5
      hover:border-slate-300 hover:shadow-md transition-all flex items-center gap-4">
      <button onClick={() => onOpen(graph.session_id)} className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
        style={{ background: 'var(--accent-pill-bg)' }}>
        <BarChart3 size={17} style={{ color: ACCENT }} />
      </button>

      <button onClick={() => onOpen(graph.session_id)} className="flex-1 min-w-0 text-left">
        <p className="text-sm font-semibold text-slate-800 truncate">{graph.name}</p>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <span className="text-[11px] text-slate-400 flex items-center gap-1">
            <Clock size={9} /> {fmt(graph.timestamp)}
          </span>
          <span className="text-[11px] text-slate-400">{graph.node_count} nodes · {graph.edge_count} edges</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
            style={{ background: mc.bg, color: mc.text }}>
            {graph.mode}
          </span>
        </div>
      </button>

      <button
        onClick={toggleSave}
        disabled={busy}
        title={saved ? 'Remove from saved' : 'Save permanently'}
        className="shrink-0 p-1.5 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-40"
      >
        {saved
          ? <BookmarkCheck size={15} style={{ color: ACCENT }} />
          : <Bookmark size={15} className="text-slate-300 hover:text-slate-400" />
        }
      </button>

      <button onClick={() => onOpen(graph.session_id)} className="shrink-0">
        <ChevronRight size={15} className="text-slate-300 hover:text-slate-400 transition-colors" />
      </button>
    </div>
  )
}

function SectionHeader({ title, subtitle, count }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div>
        <h2 className="text-sm font-bold text-slate-800">{title}</h2>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {count > 0 && (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{count}</span>
      )}
    </div>
  )
}

function EmptyState({ message, hint }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 border-dashed px-6 py-10 text-center">
      <Database size={24} className="mx-auto mb-3 text-slate-200" />
      <p className="text-sm font-medium text-slate-400">{message}</p>
      {hint && <p className="text-xs text-slate-300 mt-1">{hint}</p>}
    </div>
  )
}

export default function HomePage({ navigate }) {
  const [showModal, setShowModal]   = useState(false)
  const [uploading, setUploading]   = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [saved, setSaved]           = useState([])
  const [cached, setCached]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [sampleLoading, setSampleLoading] = useState(false)

  function loadGraphs() {
    return axios.get('/api/graphs/')
      .then(({ data }) => { setSaved(data.saved ?? []); setCached(data.cached ?? []) })
      .catch(() => {})
  }

  useEffect(() => { loadGraphs().finally(() => setLoading(false)) }, [])

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
      navigate(`/graph/${data.session_id}`)
    } catch (err) {
      setUploadError(err.response?.data?.error ?? 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  async function handleLoadSample() {
    setSampleLoading(true)
    try {
      const res  = await fetch('/mock_lineage.xlsx')
      const blob = await res.blob()
      const file = new File([blob], 'mock_lineage.xlsx', { type: blob.type })
      const formData = new FormData()
      formData.append('file', file)
      formData.append('mode', 'formula')
      formData.append('name', 'Sample — mock_lineage.xlsx')
      const { data } = await axios.post('/api/upload/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      navigate(`/graph/${data.session_id}`)
    } catch {
      // silent — user can just upload manually
    } finally {
      setSampleLoading(false)
    }
  }

  const handleSave = useCallback(async (sessionId) => {
    await axios.post(`/api/graphs/${sessionId}/save/`).catch(() => {})
    await loadGraphs()
  }, [])

  const handleUnsave = useCallback(async (sessionId) => {
    await axios.delete(`/api/graphs/${sessionId}/save/`).catch(() => {})
    await loadGraphs()
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm"
        style={{ borderTop: `3px solid ${ACCENT}` }}>
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <div style={{
              width: 30, height: 30, borderRadius: 8, background: ACCENT,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 16, color: 'white',
            }}>N</div>
            <div className="text-left">
              <p className="text-sm font-bold text-slate-900 leading-none">Nexus</p>
              <p className="text-[9px] font-semibold tracking-widest text-slate-400 leading-none mt-0.5 uppercase">Explorer</p>
            </div>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <DarkModeToggle />
            <button
              onClick={() => { setUploadError(null); setShowModal(true) }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white shadow-sm transition-colors"
              style={{ background: ACCENT }}
              onMouseEnter={e => e.currentTarget.style.background = '#6aaf35'}
              onMouseLeave={e => e.currentTarget.style.background = ACCENT}
            >
              <Plus size={15} strokeWidth={2.5} /> New graph
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-8 space-y-8">

        {/* Sample data banner */}
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center gap-4">
          <div className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--accent-pill-bg)' }}>
            <FlaskConical size={18} style={{ color: ACCENT }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800">Try with sample data</p>
            <p className="text-xs text-slate-400 mt-0.5">Load <code className="font-mono">mock_lineage.xlsx</code> to explore the graph right away</p>
          </div>
          <button
            onClick={handleLoadSample}
            disabled={sampleLoading}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50"
            style={{ color: ACCENT, borderColor: 'var(--accent-pill-border)', background: 'var(--accent-pill-bg)' }}
          >
            {sampleLoading ? 'Loading…' : 'Load sample'}
          </button>
        </div>

        {/* Saved graphs */}
        <section>
          <SectionHeader
            title="Saved graphs"
            subtitle="Permanently stored — survive cache expiry"
            count={saved.length}
          />
          {loading ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-6">
              <div className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
              Loading…
            </div>
          ) : saved.length === 0 ? (
            <EmptyState
              message="No saved graphs"
              hint="Click the bookmark icon on any cached graph to save it permanently."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {saved.map(g => (
                <GraphCard
                  key={g.session_id} graph={g}
                  onOpen={id => navigate(`/graph/${id}`)}
                  onSave={handleSave} onUnsave={handleUnsave}
                  saved
                />
              ))}
            </div>
          )}
        </section>

        {/* Cached graphs */}
        <section>
          <SectionHeader
            title="Recent graphs"
            subtitle="Cached for 24 hours · up to 50 graphs"
            count={cached.length}
          />
          {loading ? null : cached.length === 0 ? (
            <EmptyState
              message="No recent graphs"
              hint='Click "New graph" to upload an Excel file.'
            />
          ) : (
            <div className="flex flex-col gap-2">
              {cached.map(g => (
                <GraphCard
                  key={g.session_id} graph={g}
                  onOpen={id => navigate(`/graph/${id}`)}
                  onSave={handleSave} onUnsave={handleUnsave}
                  saved={false}
                />
              ))}
            </div>
          )}
        </section>

      </main>

      <footer className="text-center py-4 text-[11px] text-slate-300">
        <span style={{ color: ACCENT, fontWeight: 700 }}>nexus-explorer</span> — Data lineage visualization
      </footer>

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
