import { TYPE_CFG } from '../lib/nodeTypes.js'

export default function NodeItem({ node, isSelected, onClick }) {
  const cfg = TYPE_CFG[node.type]
  if (!cfg) return null
  const Icon = cfg.icon
  return (
    <button
      onClick={() => onClick(node)}
      className="w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2.5"
      style={{
        background: isSelected ? cfg.activeBg : 'transparent',
        border: `1px solid ${isSelected ? cfg.border : 'transparent'}`,
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface-hover)' }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
    >
      <div className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center"
        style={{ background: cfg.bg }}>
        <Icon size={12} style={{ color: cfg.color }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-app-text truncate">{node.label}</p>
        {node.sheet && <p className="text-[10px] text-app-muted font-mono truncate">{node.sheet}</p>}
      </div>
      {isSelected && <div className="shrink-0 w-1.5 h-1.5 rounded-full" style={{ background: cfg.color }} />}
    </button>
  )
}
