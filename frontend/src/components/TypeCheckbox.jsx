import { TYPE_CFG } from '../lib/nodeTypes.js'

export default function TypeCheckbox({ type, isActive, count, onToggle }) {
  const cfg = TYPE_CFG[type]
  const Icon = cfg.icon
  return (
    <label className="tc-wrap">
      <input type="checkbox" checked={isActive} onChange={() => onToggle(type)} />
      <div className={`tc-mark ${type}`}>
        <Icon size={13} />
      </div>
      <span className={`tc-count ${isActive ? 'active' : ''}`}>{count}</span>
    </label>
  )
}
