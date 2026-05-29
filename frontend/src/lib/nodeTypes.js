import { Database, GitMerge, BarChart3, LayoutDashboard } from 'lucide-react'

export const TYPE_CFG = {
  source: {
    label: 'Source', icon: Database,
    color: '#2563EB',
    bg: 'var(--type-surface-source)',
    border: 'var(--type-border-source)',
    activeBg: 'var(--type-active-source)',
    badgeBg: '#DBEAFE', badgeText: '#1D4ED8',
  },
  transformation: {
    label: 'Transfo', icon: GitMerge,
    color: '#D97706',
    bg: 'var(--type-surface-transformation)',
    border: 'var(--type-border-transformation)',
    activeBg: 'var(--type-active-transformation)',
    badgeBg: '#FEF3C7', badgeText: '#92400E',
  },
  kpi: {
    label: 'KPI', icon: BarChart3,
    color: '#059669',
    bg: 'var(--type-surface-kpi)',
    border: 'var(--type-border-kpi)',
    activeBg: 'var(--type-active-kpi)',
    badgeBg: '#D1FAE5', badgeText: '#065F46',
  },
  dashboard: {
    label: 'Dashboard', icon: LayoutDashboard,
    color: '#7C3AED',
    bg: 'var(--type-surface-dashboard)',
    border: 'var(--type-border-dashboard)',
    activeBg: 'var(--type-active-dashboard)',
    badgeBg: '#EDE9FE', badgeText: '#4C1D95',
  },
}

export const ALL_TYPES = ['source', 'transformation', 'kpi', 'dashboard']
