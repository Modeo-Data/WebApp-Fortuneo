import { useState } from 'react'
import { X, Diff, Clock, Loader2 } from 'lucide-react'
import axios from 'axios'

const STORAGE_KEY = 'nexus_recent_sessions'

export function saveRecentSession(sessionId, nodeCount, name) {
  try {
    const prev = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    const filtered = prev.filter(s => s.sessionId !== sessionId)
    const next = [
      { sessionId, nodeCount, name: name ?? null, savedAt: new Date().toISOString() },
      ...filtered,
    ].slice(0, 10)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {}
}

export function getRecentSessions() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') } catch { return [] }
}

export default function DiffPicker({ currentSessionId, onSelect, onClose }) {
  const [sessions] = useState(() =>
    getRecentSessions().filter(s => s.sessionId !== currentSessionId))
  const [loading, setLoading] = useState(null)
  const [error, setError] = useState(null)

  async function pick(sessionId) {
    setLoading(sessionId); setError(null)
    try {
      const { data } = await axios.get('/api/session/', {
        headers: { 'X-Session-ID': sessionId },
      })
      onSelect({ sessionId, nodes: data.nodes, edges: data.edges ?? [] })
    } catch {
      setError(`Impossible de charger la session ${sessionId.slice(0, 8)}…`)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Diff size={15} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-700">Comparer avec une version précédente</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4">
          {error && (
            <p className="text-xs text-red-500 mb-3 px-1">⚠️ {error}</p>
          )}

          {sessions.length === 0 ? (
            <div className="text-center py-8">
              <Clock size={28} className="text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">Aucune session récente disponible.</p>
              <p className="text-xs text-slate-300 mt-1">
                Chargez d'abord un autre graphe pour pouvoir comparer.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] text-slate-400 mb-1 uppercase tracking-wider font-semibold px-1">
                Sessions récentes
              </p>
              {sessions.map(s => (
                <button
                  key={s.sessionId}
                  disabled={!!loading}
                  onClick={() => pick(s.sessionId)}
                  className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all disabled:opacity-50"
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <Diff size={13} className="text-slate-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-700 truncate">
                      {s.name ?? `Session ${s.sessionId.slice(0, 8)}`}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {s.nodeCount} nœuds ·{' '}
                      {new Date(s.savedAt).toLocaleDateString('fr-FR', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                  {loading === s.sessionId && (
                    <Loader2 size={14} className="text-slate-400 animate-spin shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
