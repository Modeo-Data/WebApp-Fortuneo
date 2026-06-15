import { useState, useEffect, useMemo } from 'react'
import { Loader2, Link2, Flame, Copy, Route, ChevronDown, ChevronRight, Eye } from 'lucide-react'
import axios from 'axios'

const ACCENT = '#88c648'

const CATEGORIES = [
  { key: 'duplicates',     label: 'Doublons',        Icon: Copy,     color: '#ef4444' },
  { key: 'critical_paths', label: 'Chemins critiques',Icon: Route,    color: '#f59e0b' },
  { key: 'hot_spots',      label: 'Points critiques', Icon: Flame,    color: '#f97316' },
  { key: 'clusters',       label: 'Regroupements',    Icon: Link2,    color: '#3b82f6' },
]

// ── Individual insight cards ────────────────────────────────────────────────────

function DuplicateCard({ item, onHighlight }) {
  const a = item.pair[0], b = item.pair[1]
  return (
    <InsightCard
      color="#ef4444"
      title={`${a.label}  ↔  ${b.label}`}
      badge={`${Math.round(item.similarity * 100)}%`}
      suggestion={item.suggestion === 'regrouper' ? 'Regrouper' : 'À examiner'}
      nodeIds={[a.id, b.id]}
      onHighlight={onHighlight}
    >
      <p className="text-[10px] text-slate-500">
        {item.shared_inputs.length} entrées communes
        {item.same_sql && ' · même SQL'}
        {item.diff_inputs.length > 0 && ` · diff : ${item.diff_inputs.join(', ')}`}
      </p>
    </InsightCard>
  )
}

function CriticalPathCard({ item, onHighlight }) {
  const ids = item.path.map(n => n.id)
  const chain = item.path.map(n => n.label).join(' → ')
  return (
    <InsightCard
      color="#f59e0b"
      title={`Chaîne de ${item.length} étapes`}
      badge={item.feature ?? '?'}
      nodeIds={ids}
      onHighlight={onHighlight}
    >
      <p className="text-[10px] text-slate-500 font-mono break-all">{chain}</p>
    </InsightCard>
  )
}

function HotSpotCard({ item, onHighlight }) {
  const ids = [item.node_id, ...item.written_by.map(w => w.id), ...item.read_by.map(r => r.id)]
  return (
    <InsightCard
      color={item.cross_feature ? '#8b5cf6' : '#f97316'}
      title={item.label}
      badge={`${item.fan_out} lecteurs`}
      subtitle={item.cross_feature ? `Inter-feature · ${item.feature_count} features` : null}
      nodeIds={ids}
      onHighlight={onHighlight}
    >
      {item.written_by.length > 0 && (
        <p className="text-[10px] text-slate-500">
          Écrit par {item.written_by.map(w => w.label).join(', ')}
        </p>
      )}
      {item.cross_feature && item.features && (
        <div className="flex flex-wrap gap-1 mt-1">
          {Object.entries(item.features).map(([feat, count]) => (
            <span key={feat} className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
              style={{ background: '#8b5cf610', color: '#8b5cf6', border: '1px solid #8b5cf630' }}>
              {feat} ({count})
            </span>
          ))}
        </div>
      )}
      <p className="text-[10px] text-slate-400 mt-0.5 truncate">
        {item.read_by.map(r => r.label).join(', ')}
      </p>
    </InsightCard>
  )
}

function ClusterCard({ item, onHighlight }) {
  const ids = [item.source_id, ...item.readers.map(r => r.id)]
  return (
    <InsightCard
      color="#3b82f6"
      title={item.source_label}
      badge={`${item.readers.length} jobs`}
      subtitle={`${item.component_count} composants · ${item.feature_count} features`}
      nodeIds={ids}
      onHighlight={onHighlight}
    >
      <p className="text-[10px] text-slate-500 truncate">
        {item.readers.map(r => r.label).join(', ')}
      </p>
    </InsightCard>
  )
}

// ── Generic card wrapper ────────────────────────────────────────────────────────

function InsightCard({ color, title, badge, subtitle, suggestion, nodeIds, onHighlight, children }) {
  return (
    <div className="rounded-lg border px-3 py-2.5 transition-all hover:shadow-sm"
      style={{ borderColor: 'var(--hp-border)', background: 'var(--hp-card-bg, white)' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-slate-700 truncate">{title}</p>
          {subtitle && <p className="text-[10px] text-slate-400">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {badge && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}>
              {badge}
            </span>
          )}
          {suggestion && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: `${color}15`, color }}>
              {suggestion}
            </span>
          )}
        </div>
      </div>
      <div className="mt-1">{children}</div>
      {onHighlight && (
        <button
          onClick={() => onHighlight(nodeIds)}
          className="mt-2 flex items-center gap-1 text-[10px] font-semibold transition-colors"
          style={{ color: ACCENT }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          <Eye size={10} /> Voir le lineage
        </button>
      )}
    </div>
  )
}

// ── Collapsible category section ────────────────────────────────────────────────

function CategorySection({ label, Icon, color, count, children }) {
  const [open, setOpen] = useState(true)
  if (count === 0) return null
  return (
    <div>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-left">
        {open ? <ChevronDown size={10} style={{ color }} /> : <ChevronRight size={10} style={{ color }} />}
        <Icon size={11} style={{ color }} />
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>
          {label}
        </span>
        <span className="text-[9px] text-slate-400 font-medium ml-auto">{count}</span>
      </button>
      {open && <div className="flex flex-col gap-1.5 px-1 pb-2">{children}</div>}
    </div>
  )
}

// ── Main panel ──────────────────────────────────────────────────────────────────

const CARD_MAP = {
  duplicates:     DuplicateCard,
  critical_paths: CriticalPathCard,
  hot_spots:      HotSpotCard,
  clusters:       ClusterCard,
}

export default function InsightsPanel({ onHighlight }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    setLoading(true)
    axios.get('/api/catalog/insights/')
      .then(({ data }) => setData(data))
      .catch(() => setError('Impossible de charger les suggestions'))
      .finally(() => setLoading(false))
  }, [])

  const totalCount = useMemo(() => {
    if (!data) return 0
    return Object.values(data).reduce((sum, arr) => sum + arr.length, 0)
  }, [data])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center gap-2 text-xs text-slate-400">
        <Loader2 size={12} className="animate-spin" /> Analyse en cours…
      </div>
    )
  }

  if (error) {
    return <div className="flex-1 flex items-center justify-center text-xs text-red-400 px-4">{error}</div>
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {CATEGORIES.map(({ key, label, Icon, color }) => {
          const items = data?.[key] ?? []
          const Card = CARD_MAP[key]
          return (
            <CategorySection key={key} label={label} Icon={Icon} color={color} count={items.length}>
              {items.map((item, i) => (
                <Card key={i} item={item} onHighlight={onHighlight} />
              ))}
            </CategorySection>
          )
        })}
      </div>
      <div className="px-3 py-2 border-t border-slate-100 text-[10px] text-slate-400">
        {totalCount} suggestions détectées
      </div>
    </>
  )
}
