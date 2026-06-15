import { useState, useEffect, useMemo } from 'react'
import { AlertTriangle, Flame, Copy, ChevronDown, ChevronRight, Eye, Network, Target, RefreshCw, Search } from 'lucide-react'
import axios from 'axios'

const ACCENT = '#88c648'

// ── Helpers ─────────────────────────────────────────────────────────────────────

function hubTypeLabel(type) {
  if (type === 'datawarehouse') return 'DWH'
  if (type === 'dashboard' || type === 'use_case') return 'Dashboard'
  return type
}

// ── Family card (one destination hub + its converging fluxes) ──────────────────

function FamilyCard({ family, fluxesById, onHighlight }) {
  const [open, setOpen] = useState(false)
  const tint = family.cross_feature ? '#8b5cf6' : ACCENT

  const allNodeIds = useMemo(() => {
    const ids = new Set([family.hub_id])
    for (const fid of family.flux_ids) {
      const flux = fluxesById[fid]
      if (flux) flux.node_ids.forEach(n => ids.add(n))
    }
    return Array.from(ids)
  }, [family, fluxesById])

  return (
    <div
      className="rounded-lg border transition-all hover:shadow-sm"
      style={{ borderColor: 'var(--hp-border)', background: 'var(--hp-card-bg, white)' }}
    >
      <div className="flex items-start gap-2 px-3 py-2.5">
        <button
          onClick={() => setOpen(o => !o)}
          className="mt-0.5 shrink-0"
          aria-label="Toggle"
        >
          {open
            ? <ChevronDown size={11} style={{ color: tint }} />
            : <ChevronRight size={11} style={{ color: tint }} />}
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-slate-700 truncate">{family.hub_label}</p>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide">
            {hubTypeLabel(family.hub_type)}{family.is_terminal ? ' · terminal' : ''}
          </p>

          {family.features.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {family.features.map(f => (
                <span
                  key={f}
                  className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                  style={{ background: `${tint}10`, color: tint, border: `1px solid ${tint}25` }}
                >
                  {f}
                </span>
              ))}
            </div>
          )}

          {open && (
            <ul className="mt-2 flex flex-col gap-0.5">
              {family.flux_labels.map((label, i) => (
                <li key={family.flux_ids[i]} className="text-[10px] text-slate-500 truncate">
                  → {label}
                </li>
              ))}
            </ul>
          )}
        </div>

        <span
          className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
          style={{ background: `${tint}15`, color: tint, border: `1px solid ${tint}30` }}
        >
          {family.flux_count} fluxes
        </span>
      </div>

      <button
        onClick={() => onHighlight(allNodeIds)}
        className="w-full flex items-center justify-center gap-1 py-1.5 text-[10px] font-semibold border-t transition-colors hover:bg-slate-50"
        style={{ color: ACCENT, borderColor: 'var(--hp-border)' }}
      >
        <Eye size={10} /> Voir sur le graphe
      </button>
    </div>
  )
}

// ── Collapsible section ────────────────────────────────────────────────────────

function GroupSection({ title, Icon, color, count, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen)
  if (count === 0) return null
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-left"
      >
        {open ? <ChevronDown size={10} style={{ color }} /> : <ChevronRight size={10} style={{ color }} />}
        {Icon && <Icon size={11} style={{ color }} />}
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>
          {title}
        </span>
        <span className="text-[9px] text-slate-400 font-medium ml-auto">{count}</span>
      </button>
      {open && <div className="flex flex-col gap-1.5 px-1 pb-2">{children}</div>}
    </div>
  )
}

// ── Families view ──────────────────────────────────────────────────────────────

function FamiliesView({ families, fluxes, onHighlight }) {
  const fluxesById = useMemo(
    () => Object.fromEntries(fluxes.map(f => [f.id, f])),
    [fluxes],
  )

  if (families.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center text-xs text-slate-400 px-6 py-8 gap-2">
        <Network size={32} className="opacity-30" />
        <p className="font-medium text-slate-500">Aucune famille de flux à regrouper</p>
        <p className="text-[10px] leading-relaxed">
          Aucun DWH ou dashboard n'est partagé par plusieurs fluxes dans ce catalogue.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      {families.map(fam => (
        <FamilyCard
          key={fam.hub_id}
          family={fam}
          fluxesById={fluxesById}
          onHighlight={onHighlight}
        />
      ))}
    </div>
  )
}

// ── Anomalies cards ────────────────────────────────────────────────────────────

function AnomalyCard({ color, title, badge, subtitle, nodeIds, onHighlight, children }) {
  return (
    <button
      onClick={() => onHighlight(nodeIds)}
      className="w-full text-left rounded-lg border px-3 py-2.5 transition-all hover:shadow-sm"
      style={{ borderColor: 'var(--hp-border)', background: 'var(--hp-card-bg, white)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-slate-700 truncate">{title}</p>
          {subtitle && <p className="text-[10px] text-slate-400">{subtitle}</p>}
        </div>
        {badge && (
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
            style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}
          >
            {badge}
          </span>
        )}
      </div>
      <div className="mt-1">{children}</div>
      <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold" style={{ color: ACCENT }}>
        <Eye size={10} /> Voir sur le graphe
      </div>
    </button>
  )
}

function HotSpotCard({ item, onHighlight }) {
  const ids = [item.node_id, ...item.written_by.map(w => w.id), ...item.read_by.map(r => r.id)]
  return (
    <AnomalyCard
      color={item.cross_feature ? '#8b5cf6' : '#f97316'}
      title={item.label}
      badge={`${item.fan_out} lecteurs`}
      subtitle={item.cross_feature ? `Inter-feature · ${item.feature_count} features` : null}
      nodeIds={ids}
      onHighlight={onHighlight}
    >
      {item.cross_feature && (
        <div className="flex flex-wrap gap-1 mt-1">
          {Object.entries(item.features).map(([f, c]) => (
            <span
              key={f}
              className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
              style={{ background: '#8b5cf610', color: '#8b5cf6', border: '1px solid #8b5cf630' }}
            >
              {f} ({c})
            </span>
          ))}
        </div>
      )}
    </AnomalyCard>
  )
}

function DuplicateCard({ item, onHighlight }) {
  const [a, b] = item.pair
  return (
    <AnomalyCard
      color="#ef4444"
      title={`${a.label} ↔ ${b.label}`}
      badge={`${Math.round(item.similarity * 100)}%`}
      subtitle={item.same_sql ? 'Même SQL · regrouper' : 'À examiner'}
      nodeIds={[a.id, b.id]}
      onHighlight={onHighlight}
    >
      <p className="text-[10px] text-slate-500">
        {item.shared_inputs.length} entrées communes
        {item.diff_inputs.length > 0 && ` · diff : ${item.diff_inputs.join(', ')}`}
      </p>
    </AnomalyCard>
  )
}

function AnomaliesView({ hotSpots, duplicates, onHighlight }) {
  if (hotSpots.length === 0 && duplicates.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-slate-400 px-4 py-8">
        Aucune anomalie détectée.
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <GroupSection title="Points critiques" Icon={Flame} color="#f97316" count={hotSpots.length}>
        {hotSpots.map((h, i) => <HotSpotCard key={i} item={h} onHighlight={onHighlight} />)}
      </GroupSection>
      <GroupSection title="Doublons" Icon={Copy} color="#ef4444" count={duplicates.length}>
        {duplicates.map((d, i) => <DuplicateCard key={i} item={d} onHighlight={onHighlight} />)}
      </GroupSection>
    </div>
  )
}

// ── Tab bar ────────────────────────────────────────────────────────────────────

function TabButton({ active, onClick, Icon, label, count }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold transition-all"
      style={{
        color:        active ? ACCENT : 'var(--hp-subtext)',
        borderBottom: active ? `2px solid ${ACCENT}` : '2px solid transparent',
        background:   active ? `${ACCENT}08` : 'transparent',
      }}
    >
      <Icon size={12} />
      {label}
      {count !== undefined && (
        <span className="text-[9px] font-bold opacity-70">({count})</span>
      )}
    </button>
  )
}

// ── Skeleton loader (shown while insights API is loading) ─────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-lg border px-3 py-2.5"
      style={{ borderColor: 'var(--hp-border)', background: 'var(--hp-card-bg, white)' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="nd-skeleton h-3 w-2/3" />
          <div className="nd-skeleton h-2 w-1/3" />
        </div>
        <div className="nd-skeleton h-3 w-12 rounded-full shrink-0" />
      </div>
      <div className="nd-skeleton h-2 w-1/2 mt-2" />
    </div>
  )
}

function InsightsSkeleton() {
  return (
    <>
      <div className="flex border-b" style={{ borderColor: 'var(--hp-border)' }}>
        <div className="flex-1 py-2 flex items-center justify-center">
          <div className="nd-skeleton h-3 w-20" />
        </div>
        <div className="flex-1 py-2 flex items-center justify-center">
          <div className="nd-skeleton h-3 w-20" />
        </div>
      </div>
      <div className="flex-1 overflow-hidden px-2 py-2 flex flex-col gap-1.5">
        {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
      </div>
    </>
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────────

const ANOMALY_SORTS = [
  { key: 'score',    label: 'Sévérité' },
  { key: 'name',     label: 'Nom A-Z' },
  { key: 'features', label: 'Features' },
]

function fetchInsights({ onData, onError, onDone }) {
  axios.get('/api/catalog/insights/')
    .then(({ data }) => onData(data))
    .catch(() => onError('Impossible de charger les suggestions'))
    .finally(onDone)
}

function filterFamiliesByQuery(families, query) {
  if (!query) return families
  const q = query.toLowerCase()
  return families.filter(f =>
    f.hub_label.toLowerCase().includes(q) ||
    f.flux_labels.some(l => l.toLowerCase().includes(q)) ||
    f.features.some(x => x.toLowerCase().includes(q)),
  )
}

function sortAnomalies(hotSpots, duplicates, sortKey) {
  const sortHotSpots = (arr) => {
    const c = [...arr]
    if (sortKey === 'name')     c.sort((a, b) => a.label.localeCompare(b.label))
    else if (sortKey === 'features') c.sort((a, b) => b.feature_count - a.feature_count || b.score - a.score)
    else                        c.sort((a, b) => b.score - a.score)
    return c
  }
  const sortDuplicates = (arr) => {
    const c = [...arr]
    if (sortKey === 'name') c.sort((a, b) => a.pair[0].label.localeCompare(b.pair[0].label))
    else                    c.sort((a, b) => b.similarity - a.similarity)
    return c
  }
  return { hotSpots: sortHotSpots(hotSpots), duplicates: sortDuplicates(duplicates) }
}

export default function InsightsPanel({ onHighlight }) {
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [error,       setError]       = useState(null)
  const [tab,         setTab]         = useState('families')
  const [familySearch, setFamilySearch] = useState('')
  const [anomalySort, setAnomalySort] = useState('score')

  function load(initial = false) {
    if (initial) setLoading(true)
    else         setRefreshing(true)
    fetchInsights({
      onData:  d => { setData(d); setError(null) },
      onError: setError,
      onDone:  () => { setLoading(false); setRefreshing(false) },
    })
  }

  useEffect(() => { load(true) }, [])

  const familyCount  = data?.destination_families?.length ?? 0
  const anomalyCount = (data?.hot_spots?.length ?? 0) + (data?.duplicates?.length ?? 0)

  const filteredFamilies = useMemo(
    () => filterFamiliesByQuery(data?.destination_families ?? [], familySearch),
    [data, familySearch],
  )
  const sortedAnomalies  = useMemo(
    () => sortAnomalies(data?.hot_spots ?? [], data?.duplicates ?? [], anomalySort),
    [data, anomalySort],
  )

  if (loading)  return <InsightsSkeleton />
  if (error)    return <div className="flex-1 flex items-center justify-center text-xs text-red-400 px-4">{error}</div>

  return (
    <>
      <div className="flex border-b items-stretch" style={{ borderColor: 'var(--hp-border)' }}>
        <TabButton
          active={tab === 'families'}
          onClick={() => setTab('families')}
          Icon={Target}
          label="Familles"
          count={familyCount}
        />
        <TabButton
          active={tab === 'anomalies'}
          onClick={() => setTab('anomalies')}
          Icon={AlertTriangle}
          label="Anomalies"
          count={anomalyCount}
        />
        <button onClick={() => load(false)}
          disabled={refreshing}
          title="Rafraîchir"
          className="px-2.5 flex items-center justify-center transition-colors disabled:opacity-50"
          style={{ color: 'var(--hp-subtext)' }}>
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {tab === 'families' && (
        <FamilySearchBar value={familySearch} onChange={setFamilySearch} />
      )}
      {tab === 'anomalies' && (
        <AnomalySortBar value={anomalySort} onChange={setAnomalySort} />
      )}

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {tab === 'families' && (
          <FamiliesView
            families={filteredFamilies}
            fluxes={data.fluxes}
            onHighlight={onHighlight}
          />
        )}
        {tab === 'anomalies' && (
          <AnomaliesView
            hotSpots={sortedAnomalies.hotSpots}
            duplicates={sortedAnomalies.duplicates}
            onHighlight={onHighlight}
          />
        )}
      </div>

      <div className="px-3 py-2 border-t text-[10px] text-slate-400" style={{ borderColor: 'var(--hp-border)' }}>
        {tab === 'families'
          ? `${filteredFamilies.length}/${familyCount} famille${familyCount > 1 ? 's' : ''} · ${data.fluxes.length} flux`
          : `${anomalyCount} anomalies`}
      </div>
    </>
  )
}

// ── Toolbar helpers ────────────────────────────────────────────────────────────

function FamilySearchBar({ value, onChange }) {
  return (
    <div className="px-2 py-1.5 border-b flex items-center gap-1.5 transition-colors focus-within:border-b-[#88c648]"
      style={{ borderColor: 'var(--hp-border)' }}>
      <Search size={11} style={{ color: 'var(--hp-subtext)' }} />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Filtrer hubs / fluxes / features…"
        className="flex-1 bg-transparent text-[11px] outline-none"
        style={{ color: 'var(--hp-text)' }}
      />
      {value && (
        <button onClick={() => onChange('')}
          className="text-[10px] font-semibold"
          style={{ color: 'var(--hp-subtext)' }}>×</button>
      )}
    </div>
  )
}

function AnomalySortBar({ value, onChange }) {
  return (
    <div className="px-2 py-1.5 border-b flex items-center gap-1"
      style={{ borderColor: 'var(--hp-border)' }}>
      <span className="text-[9px] font-semibold uppercase tracking-wider mr-1"
        style={{ color: 'var(--hp-subtext)' }}>Tri</span>
      {ANOMALY_SORTS.map(({ key, label }) => (
        <button key={key} onClick={() => onChange(key)}
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full transition-all"
          style={{
            background: value === key ? ACCENT          : 'transparent',
            color:      value === key ? 'white'         : 'var(--hp-subtext)',
            border:     `1px solid ${value === key ? ACCENT : 'var(--hp-border)'}`,
          }}>
          {label}
        </button>
      ))}
    </div>
  )
}
