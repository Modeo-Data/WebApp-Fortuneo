import { TYPE_CFG } from '../lib/nodeTypes.js'

const STATUS_CFG = {
  added:   { label: 'Ajoutés',    color: '#16a34a', bg: '#dcfce7', dot: '#16a34a' },
  changed: { label: 'Modifiés',   color: '#d97706', bg: '#fef3c7', dot: '#d97706' },
  removed: { label: 'Supprimés',  color: '#64748b', bg: '#f1f5f9', dot: '#94a3b8' },
}

function DiffNodeRow({ node, status, isSelected, onClick }) {
  const cfg = TYPE_CFG[node.type]
  const Icon = cfg?.icon
  const sc = STATUS_CFG[status]
  return (
    <button
      onClick={() => onClick?.(node)}
      className="w-full text-left px-3 py-2 flex items-center gap-2.5 transition-all"
      style={{ opacity: status === 'removed' ? 0.65 : 1, cursor: 'pointer' }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface-hover)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      {/* Status dot */}
      <div className="shrink-0 w-1.5 h-1.5 rounded-full" style={{ background: sc.dot }} />

      {/* Type icon */}
      {Icon && (
        <div className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center"
          style={{ background: cfg.bg }}>
          <Icon size={11} style={{ color: cfg.color }} />
        </div>
      )}

      <p className="text-xs font-medium text-slate-700 truncate flex-1">{node.label}</p>

      {isSelected && (
        <div className="shrink-0 w-1.5 h-1.5 rounded-full" style={{ background: cfg?.color }} />
      )}
    </button>
  )
}

export default function DiffPanel({ diffResult, selectedNodeId, onSelect, onOpenDrawer, onOpenRemoved }) {
  const { added, changed, removed } = diffResult

  const sections = [
    { status: 'added',   nodes: added },
    { status: 'changed', nodes: changed },
    { status: 'removed', nodes: removed },
  ].filter(s => s.nodes.length > 0)

  if (sections.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-center px-4">
        <p className="text-xs text-slate-400">Aucune différence détectée entre les deux versions.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {sections.map(({ status, nodes }) => {
        const sc = STATUS_CFG[status]
        return (
          <div key={status}>
            <div className="flex items-center gap-2 px-4 pt-3 pb-1.5">
              <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: sc.dot }} />
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: sc.color }}>
                {sc.label} ({nodes.length})
              </p>
            </div>
            {nodes.map(node => (
              <DiffNodeRow
                key={node.id}
                node={node}
                status={status}
                isSelected={node.id === selectedNodeId}
                onClick={status === 'removed'
                  ? n => onOpenRemoved?.(n)
                  : n => { onSelect?.(n); onOpenDrawer?.(n) }}
              />
            ))}
          </div>
        )
      })}

      <div className="px-4 py-3 border-t border-slate-100 mt-2 text-[10px] text-slate-400">
        {added.length + changed.length + removed.length} différence{added.length + changed.length + removed.length !== 1 ? 's' : ''} au total
      </div>
    </div>
  )
}
