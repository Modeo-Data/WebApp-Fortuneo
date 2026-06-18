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
    <div className="flex items-center gap-1 bg-app-search rounded-xl p-1" role="group">
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
                ? 'bg-app-card text-app-text shadow-sm ring-1 ring-app-border'
                : 'text-app-subtext hover:text-app-text hover:bg-app-border/50'
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
