import { Layers, Workflow } from 'lucide-react'

const ACCENT = '#88c648'

const OPTIONS = [
  { key: 'dc',  label: 'DataCatalyst', sub: 'Catalog', Icon: Layers },
  { key: 'odi', label: 'ODI',          sub: 'Scenarios', Icon: Workflow },
]


function SourceCard({ option, active, onSelect }) {
  const { key, label, sub, Icon } = option
  return (
    <label className="cursor-pointer">
      <input
        type="radio"
        name="source-toggle"
        className="hidden peer"
        checked={active}
        onChange={() => onSelect(key)}
      />
      <div
        className={`relative st-card flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 ${active ? 'is-active' : 'is-inactive'}`}
        style={{
          background:  active ? `linear-gradient(180deg, ${ACCENT}18 0%, transparent 100%)` : 'var(--hp-search-bg)',
          borderColor: active ? ACCENT : 'transparent',
          transform:   active ? 'translateY(-1px)' : 'translateY(0)',
          boxShadow:   active ? `0 4px 12px ${ACCENT}30` : 'none',
        }}
      >
        <div
          className="relative w-7 h-7 rounded-md border flex items-center justify-center transition-all duration-300"
          style={{
            background:  active ? `${ACCENT}30` : 'var(--hp-card-bg)',
            borderColor: active ? `${ACCENT}aa` : 'var(--hp-border)',
            color:       active ? ACCENT : 'var(--hp-subtext)',
          }}
        >
          <Icon size={14} />
          <span
            className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full transition-all duration-300 ${active ? 'st-pulse' : ''}`}
            style={{ background: active ? ACCENT : 'var(--hp-muted)' }}
          />
        </div>

        <div className="leading-tight">
          <p
            className="text-[11px] font-bold transition-colors duration-300"
            style={{ color: active ? ACCENT : 'var(--hp-text)' }}
          >
            {label}
          </p>
          <p className="text-[8px] uppercase tracking-wider transition-opacity duration-300"
            style={{ color: 'var(--hp-subtext)', opacity: active ? 1 : 0.6 }}>
            {sub}
          </p>
        </div>

        <span
          className="st-underline absolute"
          style={{
            background: ACCENT,
            transform:  active ? 'scaleX(1)' : 'scaleX(0)',
          }}
        />
      </div>
    </label>
  )
}


export default function SourceToggle({ source, onChange }) {
  return (
    <div className="flex items-stretch gap-1.5">
      {OPTIONS.map(o => (
        <SourceCard
          key={o.key}
          option={o}
          active={source === o.key}
          onSelect={onChange}
        />
      ))}
    </div>
  )
}
