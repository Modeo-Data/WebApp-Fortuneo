import { useEffect, useRef, useState } from 'react'
import { Database, GitMerge, BarChart3, LayoutDashboard, ChevronRight, ChevronLeft, ArrowRight, Sparkles, Loader2 } from 'lucide-react'
import axios from 'axios'
import { usePanelNav } from '../hooks/usePanelNav.js'

const TYPE_CONFIG = {
  source: {
    icon: Database, label: 'Source',
    accent: '#2563EB', accentBg: 'var(--type-surface-source)',
    chipClass: 'bg-blue-50 border-blue-200 text-blue-700',
    tabClass: 'bg-blue-600 hover:bg-blue-700',
    headerStyle: { background: '#1D4ED8', color: 'white' },
  },
  transformation: {
    icon: GitMerge, label: 'Transformation',
    accent: '#D97706', accentBg: 'var(--type-surface-transformation)',
    chipClass: 'bg-amber-50 border-amber-200 text-amber-700',
    tabClass: 'bg-amber-500 hover:bg-amber-600',
    headerStyle: { background: '#D97706', color: 'white' },
  },
  kpi: {
    icon: BarChart3, label: 'KPI',
    accent: '#059669', accentBg: 'var(--type-surface-kpi)',
    chipClass: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    tabClass: 'bg-emerald-600 hover:bg-emerald-700',
    headerStyle: { background: '#047857', color: 'white' },
  },
  dashboard: {
    icon: LayoutDashboard, label: 'Dashboard',
    accent: '#7C3AED', accentBg: 'var(--type-surface-dashboard)',
    chipClass: 'bg-violet-50 border-violet-200 text-violet-700',
    tabClass: 'bg-violet-600 hover:bg-violet-700',
    headerStyle: { background: '#6D28D9', color: 'white' },
  },
}
const FALLBACK = TYPE_CONFIG.source

function NodeChip({ node, onClick }) {
  const cfg = TYPE_CONFIG[node.type] ?? FALLBACK
  const Icon = cfg.icon
  return (
    <button onClick={() => onClick(node)}
      className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs font-medium w-full text-left
        ${cfg.chipClass} transition-all hover:shadow-sm hover:translate-x-0.5`}>
      <Icon size={11} className="shrink-0" />
      <div className="min-w-0">
        <span className="block truncate font-semibold">{node.label}</span>
        {node.sheet && <span className="text-[10px] opacity-60 font-mono">{node.sheet}</span>}
      </div>
    </button>
  )
}

export default function NodeDrawer({ node, nodes, edges, onClose, onNavigate, sessionId }) {
  const isOpen = Boolean(node)
  const cfg = TYPE_CONFIG[node?.type] ?? FALLBACK
  const Icon = cfg.icon
  const isKpi = node?.type === 'kpi'

  const [explanation, setExplanation]   = useState(null)
  const [explaining, setExplaining]     = useState(false)
  const [explainError, setExplainError] = useState(null)

  useEffect(() => { setExplanation(null); setExplainError(null) }, [node?.id])

  // ── Drawer-local navigation history (shared hook) ────────────────────────────
  const nav = usePanelNav()

  // When node changes externally (canvas click / URL change) → reset stack
  useEffect(() => {
    if (!node) { nav.reset(); return }
    const current = nav.peek()
    if (!current || current.id !== node.id) nav.reset(node)
  }, [node?.id])

  nav.onBackRef.current = () => {
    const prev = nav.back()
    if (prev !== undefined) onNavigate(prev)
  }
  nav.onForwardRef.current = () => {
    const next = nav.forward()
    if (next !== undefined) onNavigate(next)
  }

  function handleChipClick(n) {
    nav.push(n)
    onNavigate(n)
  }

  // ── Deps ─────────────────────────────────────────────────────────────────────
  const upstream = node
    ? edges.filter(e => e.target === node.id)
        .map(e => nodes.find(n => n.id === e.source)).filter(Boolean)
    : []

  const downstream = node
    ? edges.filter(e => e.source === node.id)
        .map(e => nodes.find(n => n.id === e.target)).filter(Boolean)
    : []

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const contentRef = useRef(null)
  const prevId = useRef(null)
  useEffect(() => {
    if (node?.id && node.id !== prevId.current && contentRef.current) {
      contentRef.current.animate(
        [{ opacity: 0.2, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 200, easing: 'ease-out' },
      )
    }
    prevId.current = node?.id ?? null
  }, [node?.id])

  async function handleExplain() {
    setExplaining(true); setExplainError(null); setExplanation(null)
    try {
      const { data } = await axios.post('/api/explain/', { node_id: node.id }, {
        headers: { 'X-Session-ID': sessionId, 'Content-Type': 'application/json' },
      })
      setExplanation(data.explanation)
    } catch (err) {
      setExplainError(err.response?.data?.error ?? "Erreur lors de l'appel.")
    } finally {
      setExplaining(false)
    }
  }

  return (
    <aside
      {...nav.panelProps}
      className={`fixed top-0 right-0 h-full w-[340px] bg-white z-40 flex flex-col
        border-l border-slate-200 shadow-2xl
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
    >
      {/* Languette */}
      {isOpen && (
        <button onClick={onClose} aria-label="Fermer"
          className={`absolute -left-7 top-1/2 -translate-y-1/2 w-7 h-16 rounded-l-xl
            flex items-center justify-center text-white shadow-lg
            transition-all duration-150 hover:-left-8 hover:w-8 ${cfg.tabClass}`}>
          <ChevronRight size={16} strokeWidth={2.5} />
        </button>
      )}

      {/* Header */}
      <div style={cfg.headerStyle} className="px-5 py-4 shrink-0">
        {/* Back button */}
        {(nav.canGoBack || nav.canGoForward) && (
          <div className="flex items-center gap-3 mb-2">
            {nav.canGoBack && (
              <button onClick={() => nav.onBackRef.current()}
                className="flex items-center gap-1 text-[11px] font-medium opacity-70 hover:opacity-100 transition-opacity">
                <ChevronLeft size={13} /> Back
              </button>
            )}
            {nav.canGoForward && (
              <button onClick={() => nav.onForwardRef.current()}
                className="flex items-center gap-1 text-[11px] font-medium opacity-70 hover:opacity-100 transition-opacity ml-auto">
                Forward <ChevronRight size={13} />
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg shrink-0" style={{ background: 'rgba(255,255,255,0.2)' }}>
            <Icon size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">
                {cfg.label}
              </span>
              {node?.sheet && (
                <span className="text-[10px] font-mono opacity-60 bg-white/15 px-1.5 py-0.5 rounded truncate max-w-[100px]">
                  {node.sheet}
                </span>
              )}
            </div>
            <h2 className="text-base font-bold leading-tight truncate mt-0.5">{node?.label ?? '—'}</h2>
          </div>
        </div>

        {/* Dep counts pill */}
        <div className="flex items-center gap-3 mt-3">
          <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: 'rgba(255,255,255,0.2)' }}>
            {upstream.length} upstream
          </span>
          <span className="text-xs opacity-50">→</span>
          <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: 'rgba(255,255,255,0.2)' }}>
            {downstream.length} downstream
          </span>
        </div>
      </div>

      {/* Corps */}
      <div ref={contentRef} className="flex-1 overflow-y-auto">

        {/* Lineage section */}
        <div className="p-4 space-y-3">
          {/* Upstream */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
              ↑ Sources ({upstream.length})
            </p>
            {upstream.length > 0 ? (
              <div className="flex flex-col gap-1.5 pl-1 border-l-2 border-slate-100">
                {upstream.map(n => <NodeChip key={n.id} node={n} onClick={handleChipClick} />)}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic pl-1">Nœud racine</p>
            )}
          </div>

          {/* Arrow */}
          <div className="flex items-center justify-center py-1">
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-px h-3 bg-slate-200" />
              <ArrowRight size={14} className="text-slate-300 rotate-90" />
              <div className="w-px h-3 bg-slate-200" />
            </div>
          </div>

          {/* Current node */}
          <div className="rounded-xl border-2 px-3 py-2.5 flex items-center gap-2"
            style={{ borderColor: cfg.accent, background: cfg.accentBg }}>
            <Icon size={15} style={{ color: cfg.accent, flexShrink: 0 }} />
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-700 truncate">{node?.label}</p>
              <code className="text-[10px] text-slate-400 font-mono">{node?.id}</code>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex items-center justify-center py-1">
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-px h-3 bg-slate-200" />
              <ArrowRight size={14} className="text-slate-300 rotate-90" />
              <div className="w-px h-3 bg-slate-200" />
            </div>
          </div>

          {/* Downstream */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
              ↓ Alimente ({downstream.length})
            </p>
            {downstream.length > 0 ? (
              <div className="flex flex-col gap-1.5 pl-1 border-l-2 border-slate-100">
                {downstream.map(n => <NodeChip key={n.id} node={n} onClick={handleChipClick} />)}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic pl-1">Nœud terminal</p>
            )}
          </div>
        </div>

        {/* Claude section — KPI uniquement */}
        {isKpi && (
          <div className="mx-4 mb-4 rounded-xl overflow-hidden"
            style={{ border: '1px solid var(--claude-border)', background: 'var(--claude-bg)' }}>
            <div className="flex items-center justify-between px-3 py-2.5"
              style={{ borderBottom: '1px solid var(--claude-border)' }}>
              <div className="flex items-center gap-1.5">
                <Sparkles size={13} style={{ color: '#826CF0' }} />
                <span className="text-xs font-semibold" style={{ color: '#5B44C0' }}>Explain with Claude</span>
              </div>
              <button onClick={handleExplain} disabled={explaining}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium text-white transition-colors"
                style={{ background: explaining ? '#BDB0F0' : '#826CF0', cursor: explaining ? 'not-allowed' : 'pointer' }}
                onMouseEnter={e => { if (!explaining) e.currentTarget.style.background = '#6B54D4' }}
                onMouseLeave={e => { if (!explaining) e.currentTarget.style.background = '#826CF0' }}>
                {explaining ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                {explaining ? 'Analysing…' : 'Generate'}
              </button>
            </div>
            <div className="p-3">
              {!explanation && !explainError && !explaining && (
                <p className="text-[11px] italic leading-relaxed" style={{ color: '#826CF0' }}>
                  Claude will trace the full dependency path to explain how this KPI is built.
                </p>
              )}
              {explainError && (
                <p className="text-[11px] text-red-500">⚠️ {explainError}</p>
              )}
              {explanation && (
                <p className="text-[11px] text-slate-700 leading-relaxed whitespace-pre-wrap">{explanation}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-100 px-5 py-2 bg-slate-50 shrink-0 flex items-center justify-between">
        <p className="text-[10px] text-slate-400 font-mono truncate">{node?.id}</p>
        <span className="text-[10px] font-semibold shrink-0 ml-2" style={{ color: '#88c648' }}>nexus-explorer</span>
      </div>
    </aside>
  )
}
