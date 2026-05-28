import { PLATFORMS, LAYER_OPTIONS, LAYER_LABELS } from '../lib/platforms.js'

function LayerSelect({ layer, value, onChange }) {
  const platform = PLATFORMS[value] ?? PLATFORMS.custom

  return (
    <div className="flex items-center gap-2">
      <div
        className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white shadow-sm"
        style={{ background: platform.color }}
      />
      <select
        value={value}
        onChange={e => onChange(layer, e.target.value)}
        className="text-xs font-semibold text-slate-700 bg-transparent border-none outline-none cursor-pointer hover:text-slate-900"
        style={{ appearance: 'none' }}
      >
        {LAYER_OPTIONS[layer].map(id => (
          <option key={id} value={id}>{PLATFORMS[id]?.name ?? id}</option>
        ))}
      </select>
    </div>
  )
}

export default function PlatformPicker({ platforms, onChange }) {
  return (
    <div className="flex items-stretch gap-0 bg-slate-100 rounded-xl overflow-hidden border border-slate-200">
      {Object.keys(LAYER_LABELS).map((layer, i) => (
        <div
          key={layer}
          className={`flex flex-col justify-center px-3 py-1.5 gap-0.5 ${i > 0 ? 'border-l border-slate-200' : ''}`}
        >
          <p className="text-[9px] uppercase tracking-widest text-slate-400 font-bold leading-none">
            {LAYER_LABELS[layer]}
          </p>
          <LayerSelect layer={layer} value={platforms[layer]} onChange={onChange} />
        </div>
      ))}
    </div>
  )
}
