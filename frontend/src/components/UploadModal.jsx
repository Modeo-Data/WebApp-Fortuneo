import { useState, useRef, useEffect } from 'react'
import { X, UploadCloud } from 'lucide-react'

const ACCENT = '#88c648'

export default function UploadModal({
  onUpload, loading, error, onClose,
  catalogMode = false, title, subtitle,
  typeOptions = null, // [{ key, label, Icon, color }]
}) {
  const [graphName, setGraphName]     = useState('')
  const [dragging, setDragging]       = useState(false)
  const [selectedType, setSelectedType] = useState(typeOptions?.[0]?.key ?? null)
  const inputRef                      = useRef(null)

  useEffect(() => {
    const h = e => { if (e.key === 'Escape' && !loading) onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [loading, onClose])

  function handleFiles(files) {
    const valid = [...files].filter(f =>
      f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.name.endsWith('.json') || f.name.endsWith('.csv')
    )
    if (!valid.length) return
    const mode = typeOptions ? selectedType : null
    onUpload(valid, mode, catalogMode ? null : graphName || null)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(3px)' }}
      onClick={e => { if (e.target === e.currentTarget && !loading) onClose() }}
    >
      <div className="relative bg-app-card rounded-2xl shadow-2xl w-full max-w-md mx-4"
        style={{ border: '1px solid #E2E8F0' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-app-border">
          <div>
            <h2 className="text-sm font-bold text-app-text">
              {title ?? (catalogMode ? 'Importer dans le catalogue' : 'Nouveau graphe')}
            </h2>
            <p className="text-xs text-app-muted mt-0.5">
              {subtitle ?? (catalogMode
                ? 'Ajouter des fichiers au catalogue de tables persistant'
                : 'Importer un ou plusieurs fichiers')}
            </p>
          </div>
          <button onClick={onClose} disabled={loading}
            className="p-1.5 rounded-lg text-app-muted hover:text-app-text hover:bg-app-search transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">

          {/* Type selector — only when typeOptions provided */}
          {typeOptions && (
            <div>
              <label className="text-xs font-semibold text-app-subtext uppercase tracking-wider block mb-2">
                Type de données
              </label>
              <div className="flex gap-2">
                {typeOptions.map(({ key, label, Icon, color }) => {
                  const active = selectedType === key
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedType(key)}
                      disabled={loading}
                      className="flex-1 flex flex-col items-center gap-1.5 py-2.5 rounded-xl border text-xs font-semibold transition-all"
                      style={{
                        borderColor: active ? color : '#E2E8F0',
                        background:  active ? `${color}12` : 'transparent',
                        color:       active ? color : '#94a3b8',
                        boxShadow:   active ? `0 0 0 2px ${color}25` : 'none',
                      }}
                    >
                      <Icon size={14} />
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Name input — only for regular graph mode */}
          {!catalogMode && (
            <div>
              <label className="text-xs font-semibold text-app-subtext uppercase tracking-wider block mb-1.5">
                Nom du graphe <span className="normal-case font-normal text-app-muted">(optionnel)</span>
              </label>
              <input
                type="text"
                value={graphName}
                onChange={e => setGraphName(e.target.value)}
                placeholder="ex. KPIs Revenus T1"
                className="w-full text-sm px-3 py-2 rounded-lg border border-app-border bg-app-bg focus:outline-none transition"
                onFocus={e => e.target.style.boxShadow = `0 0 0 2px ${ACCENT}40`}
                onBlur={e => e.target.style.boxShadow = ''}
              />
            </div>
          )}

          {/* Drop zone */}
          <div
            onClick={() => !loading && inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
            className={`border-2 border-dashed rounded-xl px-6 py-8 text-center transition-all cursor-pointer
              ${dragging ? 'border-green-400 bg-green-50' : 'border-app-border hover:border-green-300 hover:bg-app-bg'}
              ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {loading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-7 h-7 border-4 border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: ACCENT, borderTopColor: 'transparent' }} />
                <p className="text-sm text-app-subtext font-medium">Traitement en cours…</p>
              </div>
            ) : (
              <>
                <UploadCloud size={28} className="mx-auto mb-2 text-app-dim" />
                <p className="text-sm font-semibold text-app-text">
                  Déposez des fichiers ici ou <span style={{ color: ACCENT }}>parcourez</span>
                </p>
                <p className="text-xs text-app-muted mt-1">.xlsx / .xls / .csv / .json — plusieurs fichiers acceptés</p>
              </>
            )}
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv,.json" multiple className="hidden"
              onChange={e => handleFiles(e.target.files)} />
          </div>

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
