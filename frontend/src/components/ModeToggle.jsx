const MODES = [
  {
    id: 'formula',
    icon: '⚗️',
    label: 'Formules',
    desc: 'Détecte automatiquement les dépendances à partir des formules Excel',
  },
  {
    id: 'structured',
    icon: '🗂️',
    label: 'Structuré',
    desc: 'Lit des sheets nommées Sources / Transformations / KPIs',
  },
]

export default function ModeToggle({ mode, onChange }) {
  return (
    <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1" role="group">
      {MODES.map((m) => {
        const active = mode === m.id
        return (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            title={m.desc}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              transition-all duration-150 whitespace-nowrap
              ${active
                ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }
            `}
          >
            <span>{m.icon}</span>
            {m.label}
          </button>
        )
      })}
    </div>
  )
}
