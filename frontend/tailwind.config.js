/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Node type palette — mirrors DataHub's color scheme
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
