import { useState, useRef, useEffect } from 'react'
import { X, UploadCloud } from 'lucide-react'
import ModeToggle from './ModeToggle.jsx'

const ACCENT = '#88c648'

export default function UploadModal({ onUpload, loading, error, onClose }) {
  const [mode, setMode] = useState('formula')
  const [graphName, setGraphName] = useState('')
  const [dragging, setDragging] = useState(false)
  const [isJson, setIsJson] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    const h = e => { if (e.key === 'Escape' && !loading) onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [loading, onClose])

  function handleFiles(files) {
    const arr = [...files]
    const valid = arr.filter(f =>
      f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.name.endsWith('.json')
    )
    if (!valid.length) return
    const json = valid.every(f => f.name.endsWith('.json'))
    setIsJson(json)
    onUpload(valid, json ? 'json' : mode, graphName || null)
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(3px)' }}
      onClick={e => { if (e.target === e.currentTarget && !loading) onClose() }}
    >
      {/* Card */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4"
        style={{ border: '1px solid #E2E8F0' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-800">New graph</h2>
            <p className="text-xs text-slate-400 mt-0.5">Upload one or more Excel files</p>
          </div>
          <button onClick={onClose} disabled={loading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Mode toggle — hidden for JSON imports */}
          {!isJson && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Parse mode</span>
              <ModeToggle mode={mode} onChange={setMode} />
            </div>
          )}

          {/* Name input */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              Graph name <span className="normal-case font-normal text-slate-400">(optional)</span>
            </label>
            <input
              type="text"
              value={graphName}
              onChange={e => setGraphName(e.target.value)}
              placeholder="e.g. Q1 Revenue KPIs"
              className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 bg-slate-50
                focus:outline-none transition"
              onFocus={e => e.target.style.boxShadow = `0 0 0 2px ${ACCENT}40`}
              onBlur={e => e.target.style.boxShadow = ''}
            />
          </div>

          {/* Drop zone */}
          <div
            onClick={() => !loading && inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
            className={`border-2 border-dashed rounded-xl px-6 py-8 text-center transition-all cursor-pointer
              ${dragging ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-orange-300 hover:bg-slate-50'}
              ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {loading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-7 h-7 border-4 border-orange-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-slate-500 font-medium">Analysing…</p>
              </div>
            ) : (
              <>
                <UploadCloud size={28} className="mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-semibold text-slate-600">
                  Drop files here or <span style={{ color: ACCENT }}>browse</span>
                </p>
                <p className="text-xs text-slate-400 mt-1">.xlsx / .xls / .json — multiple files supported</p>
              </>
            )}
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.json" multiple className="hidden"
              onChange={e => handleFiles(e.target.files)} />
          </div>

          {/* Mode hint */}
          <p className="text-xs text-slate-400 leading-relaxed">
            {isJson
              ? <><strong className="text-slate-600">JSON mode</strong> — re-imports a graph previously exported from Nexus Explorer.</>
              : mode === 'formula'
              ? <><strong className="text-slate-600">Formula mode</strong> — dependencies auto-detected from cell formulas.</>
              : <><strong className="text-slate-600">Structured mode</strong> — expects sheets: <code className="bg-slate-100 px-1 rounded">Sources</code>, <code className="bg-slate-100 px-1 rounded">Transformations</code>, <code className="bg-slate-100 px-1 rounded">KPIs</code>.</>
            }
          </p>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              ⚠️ {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
