import { useState, useEffect } from 'react'
import axios from 'axios'
import UploadModal from '../components/UploadModal.jsx'
import { BarChart3, Clock, ChevronRight, Plus, Database } from 'lucide-react'

const ACCENT = '#FF7327'

function fmt(iso) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso))
  } catch { return iso }
}

const MODE_COLOR = {
  formula:    { bg: '#EFF6FF', text: '#2563EB' },
  structured: { bg: '#F0FDF4', text: '#16A34A' },
}

function GraphCard({ graph, onOpen }) {
  const mc = MODE_COLOR[graph.mode] ?? { bg: '#F8FAFC', text: '#64748B' }
  return (
    <button
      onClick={() => onOpen(graph.session_id)}
      className="w-full text-left bg-white rounded-xl border border-slate-200 px-4 py-3.5
        hover:border-orange-300 hover:shadow-md transition-all group flex items-center gap-4"
    >
      <div className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
        style={{ background: '#FFF4EE' }}>
        <BarChart3 size={17} style={{ color: ACCENT }} />
      </div>

      <div className="flex-1 min-w-0">
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
      </div>

      <ChevronRight size={15} className="text-slate-300 group-hover:text-orange-400 transition-colors shrink-0" />
    </button>
  )
}

export default function HomePage({ navigate }) {
  const [showModal, setShowModal] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [savedGraphs, setSavedGraphs] = useState([])
  const [loadingGraphs, setLoadingGraphs] = useState(true)

  useEffect(() => {
    axios.get('/api/graphs/')
      .then(({ data }) => setSavedGraphs(data))
      .catch(() => {})
      .finally(() => setLoadingGraphs(false))
  }, [])

  async function handleUpload(files, mode, name) {
    setUploading(true)
    setUploadError(null)
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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm"
        style={{ borderTop: `3px solid ${ACCENT}` }}>
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center gap-3">
          {/* Logo — clicking goes home (no-op here, useful when embedded) */}
          <button onClick={() => navigate('/')} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <div style={{
              width: 30, height: 30, borderRadius: 8, background: ACCENT,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 16, color: 'white',
            }}>M</div>
            <div className="text-left">
              <p className="text-sm font-bold text-slate-900 leading-none">Modeo Lineage</p>
              <p className="text-[10px] text-slate-400 leading-none mt-0.5">KPI data lineage</p>
            </div>
          </button>

          <div className="ml-auto">
            <button
              onClick={() => { setUploadError(null); setShowModal(true) }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white shadow-sm transition-colors"
              style={{ background: ACCENT }}
              onMouseEnter={e => e.currentTarget.style.background = '#E5601A'}
              onMouseLeave={e => e.currentTarget.style.background = ACCENT}
            >
              <Plus size={15} strokeWidth={2.5} />
              New graph
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-8 space-y-6">

        {/* Recent graphs */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Recent graphs</h2>
              <p className="text-xs text-slate-400 mt-0.5">Saved for 24 hours · up to 50 graphs</p>
            </div>
            {savedGraphs.length > 0 && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                {savedGraphs.length}
              </span>
            )}
          </div>

          {loadingGraphs ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-6">
              <div className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
              Loading…
            </div>
          ) : savedGraphs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 border-dashed px-6 py-14 text-center">
              <Database size={28} className="mx-auto mb-3 text-slate-200" />
              <p className="text-sm font-medium text-slate-400">No graphs yet</p>
              <p className="text-xs text-slate-300 mt-1">Click <strong>New graph</strong> to upload an Excel file.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {savedGraphs.map(g => (
                <GraphCard key={g.session_id} graph={g} onOpen={id => navigate(`/graph/${id}`)} />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="text-center py-4 text-[11px] text-slate-300">
        <span style={{ color: ACCENT, fontWeight: 700 }}>modeo.ai</span> — KPI lineage visualization
      </footer>

      {/* Upload modal */}
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
