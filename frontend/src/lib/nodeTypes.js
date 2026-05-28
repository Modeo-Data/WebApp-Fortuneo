import { Database, GitMerge, BarChart3 } from 'lucide-react'

export const TYPE_CFG = {
  source: {
    label: 'Source', icon: Database,
    color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', badgeBg: '#DBEAFE', badgeText: '#1D4ED8',
    activeBg: '#DBEAFE',
  },
  transformation: {
    label: 'Transfo', icon: GitMerge,
    color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', badgeBg: '#FEF3C7', badgeText: '#92400E',
    activeBg: '#FEF3C7',
  },
  kpi: {
    label: 'KPI', icon: BarChart3,
    color: '#059669', bg: '#ECFDF5', border: '#A7F3D0', badgeBg: '#D1FAE5', badgeText: '#065F46',
    activeBg: '#D1FAE5',
  },
}

export const ALL_TYPES = ['source', 'transformation', 'kpi']
