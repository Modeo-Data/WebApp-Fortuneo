import { Database, GitMerge, LayoutDashboard } from 'lucide-react'

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
    label: 'Transformation', icon: GitMerge,
    color: '#D97706',
    bg: 'var(--type-surface-transformation)',
    border: 'var(--type-border-transformation)',
    activeBg: 'var(--type-active-transformation)',
    badgeBg: '#FEF3C7', badgeText: '#92400E',
  },
  use_case: {
    label: 'Use Case', icon: LayoutDashboard,
    color: '#7C3AED',
    bg: 'var(--type-surface-use_case)',
    border: 'var(--type-border-use_case)',
    activeBg: 'var(--type-active-use_case)',
    badgeBg: '#EDE9FE', badgeText: '#4C1D95',
  },
}

export const ALL_TYPES = ['source', 'transformation', 'use_case']
