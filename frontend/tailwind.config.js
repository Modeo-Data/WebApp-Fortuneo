/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        app: {
          bg:      'var(--hp-bg)',
          card:    'var(--hp-card-bg)',
          header:  'var(--hp-header-bg)',
          border:  'var(--hp-border)',
          text:    'var(--hp-text)',
          subtext: 'var(--hp-subtext)',
          muted:   'var(--hp-muted)',
          dim:     'var(--hp-dim)',
          search:  'var(--hp-search-bg)',
          hover:   'var(--surface-hover)',
          accent:  '#88c648',
        },
        source: {
          bg: '#DBEAFE',
          border: '#3B82F6',
          text: '#1E40AF',
        },
        transformation: {
          bg: '#FEF3C7',
          border: '#F59E0B',
          text: '#92400E',
        },
        kpi: {
          bg: '#D1FAE5',
          border: '#10B981',
          text: '#065F46',
        },
      },
    },
  },
  plugins: [],
}
