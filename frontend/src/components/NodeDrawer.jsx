import { useEffect, useRef, useState } from 'react'
import { Database, GitMerge, LayoutDashboard, ChevronRight, ArrowRight, Sparkles, Loader2, FileCode2, FileJson, AlignLeft, Lightbulb } from 'lucide-react'
import axios from 'axios'
import { usePanelNav } from '../hooks/usePanelNav.js'
import InsightsPanel from './InsightsPanel.jsx'

// usePanelNav is kept solely for gesture interception (trackpad, keyboard, mouse buttons).
// Navigation state (canGoBack) is driven externally via props so it stays in sync with
// the browser's own history stack.

function _cfg(icon, label, accent, darker) {
  return {
    icon, label, accent,
    accentBg: `${accent}12`,
    chipStyle:   { background: `${accent}10`, borderColor: `${accent}40`, color: accent },
    tabStyle:    { background: darker },
    tabHover:    accent,
    headerStyle: { background: darker, color: 'white' },
  }
}

const TYPE_CONFIG = {
  feature:        _cfg(Database,        'Feature',        '#88c648', '#5a8a1e'),
  component:      _cfg(Database,        'Component',      '#8b5cf6', '#6D28D9'),
  collection:     _cfg(GitMerge,        'Collection',     '#d97706', '#B45309'),
  datalake:       _cfg(Database,        'Data Lake',      '#ec4899', '#be185d'),
  datawarehouse:  _cfg(Database,        'Data Warehouse', '#14b8a6', '#0f766e'),
  ingest:         _cfg(GitMerge,        'Ingest',         '#2563eb', '#1D4ED8'),
  compute:        _cfg(GitMerge,        'Compute',        '#d97706', '#B45309'),
  virtual:        _cfg(GitMerge,        'Virtual',        '#06b6d4', '#0e7490'),
  extract:        _cfg(GitMerge,        'Extract',        '#10b981', '#047857'),
  source:         _cfg(Database,        'Source',         '#2563eb', '#1D4ED8'),
  transformation: _cfg(GitMerge,        'Transformation', '#d97706', '#B45309'),
  use_case:       _cfg(LayoutDashboard, 'Dashboard',      '#8b5cf6', '#6D28D9'),
}

// dbt stage overrides for transformation nodes
const STAGE_HEADER = {
  staging: { background: '#991b1b', color: 'white' },
  core:    { background: '#9a3412', color: 'white' },
  mart:    { background: '#854d0e', color: 'white' },
}

const FALLBACK = TYPE_CONFIG.source

function NodeChip({ node, onClick }) {
  const cfg = TYPE_CONFIG[node.type] ?? FALLBACK
  const Icon = cfg.icon
  return (
    <button onClick={() => onClick(node)}
      className="flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs font-medium w-full text-left transition-all hover:shadow-sm hover:translate-x-0.5"
      style={cfg.chipStyle}>
      <Icon size={11} className="shrink-0" style={{ color: cfg.accent }} />
      <div className="min-w-0">
        <span className="block truncate font-semibold">{node.label}</span>
        {node.sheet && <span className="text-[10px] opacity-60 font-mono">{node.sheet}</span>}
      </div>
    </button>
  )
}

export default function NodeDrawer({ node, nodes, edges, edgesOverride, nodesOverride, isRemovedNode, onClose, onNavigate, onHighlight, onOpenSuggestions, onCloseSuggestions, showSuggestions, sessionId, isOpen }) {
  const cfg = TYPE_CONFIG[node?.type] ?? FALLBACK
  const Icon = cfg.icon
  const isUseCase = node?.type === 'use_case'
  const headerStyle = (node?.stage && STAGE_HEADER[node.stage]) ? STAGE_HEADER[node.stage] : cfg.headerStyle
  const stageLabel  = node?.stage ? node.stage.charAt(0).toUpperCase() + node.stage.slice(1) : null

  const [explanation, setExplanation]   = useState(null)
  const [explaining, setExplaining]     = useState(false)
  const [explainError, setExplainError] = useState(null)

  useEffect(() => { setExplanation(null); setExplainError(null) }, [node?.id])

  // ── Gesture interception only — back/forward are wired to browser history ────
  const nav = usePanelNav()

  nav.onBackRef.current    = () => window.history.back()
  nav.onForwardRef.current = () => window.history.forward()

  function handleChipClick(n) {
    onNavigate(n)
  }

  // ── Deps ─────────────────────────────────────────────────────────────────────
  const activeEdges = edgesOverride ?? edges
  const activeNodes = nodesOverride ?? nodes

  const upstream = node
    ? activeEdges.filter(e => e.target === node.id)
        .map(e => activeNodes.find(n => n.id === e.source)).filter(Boolean)
    : []

  const downstream = node
    ? activeEdges.filter(e => e.source === node.id)
        .map(e => activeNodes.find(n => n.id === e.target)).filter(Boolean)
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
      className={`relative h-full shrink-0 bg-white flex flex-col
        border-l border-slate-200 shadow-2xl
        transition-[width] duration-300 ease-in-out overflow-hidden
        ${isOpen ? 'w-[340px]' : 'w-0'}`}
    >
      {/* Languette — peeks out over the canvas left edge */}
      {isOpen && (
        <button onClick={onClose} aria-label="Fermer"
          className="absolute -left-7 top-1/2 -translate-y-1/2 w-7 h-16 rounded-l-xl z-10
            flex items-center justify-center text-white shadow-lg
            transition-all duration-150 hover:-left-8 hover:w-8"
          style={node ? cfg.tabStyle : { background: '#94a3b8' }}>
          <ChevronRight size={16} strokeWidth={2.5} />
        </button>
      )}
      {/* Fixed-width inner wrapper so content never reflows during the width animation */}
      <div className="w-[340px] flex flex-col h-full">

      {showSuggestions ? (
        <>
          {/* ── Suggestions panel ────────────────────────────────────────────── */}
          <div className="px-4 py-3 shrink-0 border-b border-slate-200 flex items-center gap-2"
            style={{ background: '#fef3c7' }}>
            <button onClick={onCloseSuggestions}
              className="w-6 h-6 rounded-md flex items-center justify-center transition-colors"
              style={{ color: '#92400e' }}
              onMouseEnter={e => e.currentTarget.style.background = '#fde68a'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} />
            </button>
            <Lightbulb size={13} style={{ color: '#f59e0b' }} />
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#92400e' }}>
              Suggestions
            </p>
          </div>
          <InsightsPanel onHighlight={onHighlight} />
        </>

      ) : node ? (
        <>
          {/* ── Header (node selected) ───────────────────────────────────────── */}
          <div style={headerStyle} className="px-5 py-4 shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg shrink-0" style={{ background: 'rgba(255,255,255,0.2)' }}>
                <Icon size={18} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">
                    {stageLabel ?? cfg.label}
                  </span>
                  {isRemovedNode && (
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(0,0,0,0.25)', color: 'white' }}>
                      Supprimé
                    </span>
                  )}
                  {node.sheet && (
                    <span className="text-[10px] font-mono opacity-60 bg-white/15 px-1.5 py-0.5 rounded truncate max-w-[100px]">
                      {node.sheet}
                    </span>
                  )}
                </div>
                <h2 className="text-base font-bold leading-tight truncate mt-0.5">{node.label}</h2>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-3">
              <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: 'rgba(255,255,255,0.2)' }}>
                {upstream.length} en amont
              </span>
              <span className="text-xs opacity-50">→</span>
              <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: 'rgba(255,255,255,0.2)' }}>
                {downstream.length} en aval
              </span>
            </div>
          </div>

          {/* ── Body (node selected) ─────────────────────────────────────────── */}
          <div ref={contentRef} className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  ↑ Sources ({upstream.length})
                </p>
                {upstream.length > 0 ? (
                  <div className="flex flex-col gap-1.5 pl-1 border-l-2 border-slate-200">
                    {upstream.map(n => <NodeChip key={n.id} node={n} onClick={handleChipClick} />)}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic pl-1">Nœud racine</p>
                )}
              </div>
              <div className="flex items-center justify-center py-1">
                <div className="flex flex-col items-center gap-0.5">
                  <div className="w-px h-3 bg-slate-300" />
                  <ArrowRight size={14} className="text-slate-300 rotate-90" />
                  <div className="w-px h-3 bg-slate-300" />
                </div>
              </div>
              <div className="rounded-xl border-2 px-3 py-2.5 flex items-center gap-2"
                style={{ borderColor: cfg.accent, background: cfg.accentBg }}>
                <Icon size={15} style={{ color: cfg.accent, flexShrink: 0 }} />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-700 truncate">{node.label}</p>
                  <code className="text-[10px] text-slate-400 font-mono">{node.id}</code>
                </div>
              </div>
              <div className="flex items-center justify-center py-1">
                <div className="flex flex-col items-center gap-0.5">
                  <div className="w-px h-3 bg-slate-300" />
                  <ArrowRight size={14} className="text-slate-300 rotate-90" />
                  <div className="w-px h-3 bg-slate-300" />
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  ↓ Alimente ({downstream.length})
                </p>
                {downstream.length > 0 ? (
                  <div className="flex flex-col gap-1.5 pl-1 border-l-2 border-slate-200">
                    {downstream.map(n => <NodeChip key={n.id} node={n} onClick={handleChipClick} />)}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic pl-1">Nœud terminal</p>
                )}
              </div>
            </div>

            {node?.type === 'collection' && node?.metadata && (
              <div className="mx-4 mb-3 flex flex-col gap-2">
                {node.metadata.nom_sql && (
                  <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: 'var(--hp-border)', background: 'var(--hp-search-bg)' }}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <FileCode2 size={11} className="text-slate-400 shrink-0" />
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Script SQL</span>
                    </div>
                    <code className="text-[11px] font-mono text-slate-600 break-all">{node.metadata.nom_sql}</code>
                    {node.metadata.fichier_xml && (
                      <div className="flex items-center gap-1.5 mt-2 pt-2 border-t" style={{ borderColor: 'var(--hp-border)' }}>
                        <FileJson size={11} className="text-slate-400 shrink-0" />
                        <code className="text-[11px] font-mono text-slate-500 break-all">{node.metadata.fichier_xml}</code>
                      </div>
                    )}
                  </div>
                )}
                {node.metadata.description && (
                  <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: 'var(--hp-border)', background: 'var(--hp-search-bg)' }}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <AlignLeft size={11} className="text-slate-400 shrink-0" />
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Description</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">{node.metadata.description}</p>
                  </div>
                )}
              </div>
            )}

            {isUseCase && (
              <div className="mx-4 mb-4 rounded-xl overflow-hidden"
                style={{ border: '1px solid var(--claude-border)', background: 'var(--claude-bg)' }}>
                <div className="flex items-center justify-between px-3 py-2.5"
                  style={{ borderBottom: '1px solid var(--claude-border)' }}>
                  <div className="flex items-center gap-1.5">
                    <Sparkles size={13} style={{ color: '#826CF0' }} />
                    <span className="text-xs font-semibold" style={{ color: '#5B44C0' }}>Expliquer avec Claude</span>
                  </div>
                  <button onClick={handleExplain} disabled={explaining}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium text-white transition-colors"
                    style={{ background: explaining ? '#BDB0F0' : '#826CF0', cursor: explaining ? 'not-allowed' : 'pointer' }}
                    onMouseEnter={e => { if (!explaining) e.currentTarget.style.background = '#6B54D4' }}
                    onMouseLeave={e => { if (!explaining) e.currentTarget.style.background = '#826CF0' }}>
                    {explaining ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                    {explaining ? 'Analyse…' : 'Générer'}
                  </button>
                </div>
                <div className="p-3">
                  {!explanation && !explainError && !explaining && (
                    <p className="text-[11px] italic leading-relaxed" style={{ color: '#826CF0' }}>
                      Claude va retracer le chemin de dépendances complet pour expliquer comment ce KPI est construit.
                    </p>
                  )}
                  {explainError && <p className="text-[11px] text-red-500">⚠️ {explainError}</p>}
                  {explanation && <p className="text-[11px] text-slate-700 leading-relaxed whitespace-pre-wrap">{explanation}</p>}
                </div>
              </div>
            )}
          </div>

          {/* ── Footer (node selected) with lightbulb button ─────────────────── */}
          <div className="border-t border-slate-200 px-3 py-2 bg-slate-100 shrink-0 flex items-center justify-between">
            <p className="text-[10px] text-slate-400 font-mono truncate flex-1 mr-2">{node.id}</p>
            <button onClick={onOpenSuggestions} title="Suggestions"
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all shrink-0"
              style={{ background: '#fef3c7', border: '1px solid #fcd34d' }}
              onMouseEnter={e => e.currentTarget.style.background = '#fde68a'}
              onMouseLeave={e => e.currentTarget.style.background = '#fef3c7'}>
              <Lightbulb size={13} style={{ color: '#f59e0b' }} />
            </button>
          </div>
        </>

      ) : (
        <>
          {/* ── Placeholder (no node selected) — lightbulb on top ────────────── */}
          <div className="px-5 py-4 shrink-0 border-b border-slate-200 flex items-center justify-between"
            style={{ background: 'var(--hp-header-bg)' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--hp-text-muted, #94a3b8)' }}>
              Détails du nœud
            </p>
            <button onClick={onOpenSuggestions} title="Suggestions"
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all shrink-0"
              style={{ background: '#fef3c7', border: '1px solid #fcd34d' }}
              onMouseEnter={e => e.currentTarget.style.background = '#fde68a'}
              onMouseLeave={e => e.currentTarget.style.background = '#fef3c7'}>
              <Lightbulb size={13} style={{ color: '#f59e0b' }} />
            </button>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
              <Lightbulb size={22} className="text-slate-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500 mb-1.5">Aucun nœud sélectionné</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Cliquez sur un nœud du graphe ou utilisez le panneau de gauche.
              </p>
            </div>
          </div>
          <div className="border-t border-slate-200 px-5 py-2 bg-slate-100 shrink-0 flex items-center justify-end">
            <span className="text-[10px] font-semibold" style={{ color: '#88c648' }}>nexus-explorer</span>
          </div>
        </>
      )}

      </div>{/* end fixed-width inner wrapper */}
    </aside>
  )
}
