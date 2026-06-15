import { useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'

const PAGE_SIZE = 8


// ── One clickable pill with a paginated dropdown of catalog nodes ──────────────

function ClickablePill({ pill, count, items, isOpen, onToggle, onSelectNode, generating }) {
  const { type, label, Icon, color } = pill
  const [page, setPage]   = useState(0)
  const totalPages = Math.ceil(items.length / PAGE_SIZE)
  const safePage   = Math.min(page, Math.max(0, totalPages - 1))
  const pageItems  = items.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  function handleToggle() {
    if (!isOpen) setPage(0)
    onToggle(type)
  }

  return (
    <div className="relative">
      <button
        onClick={handleToggle}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md border transition-all cursor-pointer"
        style={{
          borderColor: isOpen ? color : 'var(--hp-border)',
          background:  isOpen ? `${color}12` : 'var(--hp-card-bg)',
          boxShadow:   isOpen ? `0 0 0 1px ${color}30` : 'none',
        }}
        onMouseEnter={e => { if (!isOpen) { e.currentTarget.style.borderColor = color; e.currentTarget.style.background = `${color}10` } }}
        onMouseLeave={e => { if (!isOpen) { e.currentTarget.style.borderColor = 'var(--hp-border)'; e.currentTarget.style.background = 'var(--hp-card-bg)' } }}>
        <Icon size={9} style={{ color }} />
        <span className="text-[11px] font-bold" style={{ color }}>{count}</span>
        <span className="text-[9px] font-medium" style={{ color: 'var(--hp-muted)' }}>{label}</span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => onToggle(null)} />
          <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 w-52 rounded-lg border shadow-lg z-50 overflow-hidden"
            style={{ background: 'var(--hp-header-bg)', borderColor: 'var(--hp-border)' }}>

            <div className="py-1">
              {pageItems.map(n => (
                <PillMenuRow key={n.node_id} node={n} Icon={Icon} color={color}
                  busy={generating === n.node_id}
                  disabled={!!generating}
                  onSelect={() => onSelectNode(n.node_id)} />
              ))}
            </div>

            {totalPages > 1 && (
              <PillPager page={safePage} totalPages={totalPages} onPage={setPage} />
            )}
          </div>
        </>
      )}
    </div>
  )
}


// ── Row inside the dropdown ────────────────────────────────────────────────────

function PillMenuRow({ node, Icon, color, busy, disabled, onSelect }) {
  return (
    <button onClick={onSelect}
      disabled={disabled}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors disabled:opacity-50"
      onMouseEnter={e => e.currentTarget.style.background = `${color}08`}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      {busy
        ? <Loader2 size={9} style={{ color }} className="animate-spin shrink-0" />
        : <Icon size={9} style={{ color, flexShrink: 0 }} />
      }
      <span className="text-[11px] font-medium truncate" style={{ color: 'var(--hp-text)' }}>{node.label}</span>
      <ArrowRight size={9} className="ml-auto shrink-0" style={{ color: 'var(--hp-dim)' }} />
    </button>
  )
}


// ── Pagination footer ──────────────────────────────────────────────────────────

function PillPager({ page, totalPages, onPage }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-t" style={{ borderColor: 'var(--hp-border)' }}>
      <PagerButton disabled={page === 0} onClick={() => onPage(p => Math.max(0, p - 1))}>← Préc.</PagerButton>
      <span className="text-[9px] font-medium" style={{ color: 'var(--hp-muted)' }}>
        {page + 1} / {totalPages}
      </span>
      <PagerButton disabled={page >= totalPages - 1} onClick={() => onPage(p => Math.min(totalPages - 1, p + 1))}>Suiv. →</PagerButton>
    </div>
  )
}

function PagerButton({ disabled, onClick, children }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors disabled:opacity-30"
      style={{ color: 'var(--hp-muted)' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover, rgba(0,0,0,0.04))'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      {children}
    </button>
  )
}


// ── Static (non-clickable) pill ────────────────────────────────────────────────

function StaticPill({ pill, count }) {
  const { label, Icon, color } = pill
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border opacity-60"
      style={{ borderColor: 'var(--hp-border)', background: 'var(--hp-card-bg)' }}>
      <Icon size={9} style={{ color }} />
      <span className="text-[11px] font-bold" style={{ color }}>{count}</span>
      <span className="text-[9px] font-medium" style={{ color: 'var(--hp-muted)' }}>{label}</span>
    </div>
  )
}


// ── Public component ───────────────────────────────────────────────────────────

export default function TypePills({
  pills,
  clickableTypes,
  stats,
  catalogNodes,
  onSelectNode,
  generating,
}) {
  const [openPill, setOpenPill] = useState(null)

  const clickable = pills.filter(p => clickableTypes.has(p.type) && (stats[p.type] ?? 0) > 0)
  const statics   = pills.filter(p => !clickableTypes.has(p.type) && (stats[p.type] ?? 0) > 0)

  function handleToggle(type) {
    setOpenPill(prev => (prev === type ? null : type))
  }

  return (
    <div className="flex items-center justify-center gap-2 flex-wrap">
      {clickable.map(pill => (
        <ClickablePill
          key={pill.type}
          pill={pill}
          count={stats[pill.type]}
          items={catalogNodes.filter(n => n.type === pill.type)}
          isOpen={openPill === pill.type}
          onToggle={handleToggle}
          onSelectNode={onSelectNode}
          generating={generating}
        />
      ))}

      {clickable.length > 0 && statics.length > 0 && (
        <div className="w-px h-4" style={{ background: 'var(--hp-border)' }} />
      )}

      {statics.map(pill => (
        <StaticPill key={pill.type} pill={pill} count={stats[pill.type]} />
      ))}
    </div>
  )
}
