import type { ParseKeys } from 'i18next'
import { ArrowLeftRight, ChartPie, LayoutDashboard, PiggyBank, type LucideIcon } from 'lucide-react'

export type NavigationItem = {
  to: string
  label: ParseKeys
  /** Set on the screens that get a tab of their own on a phone; the rest sit under More. */
  tabIcon?: LucideIcon
}

/** The main navigation, in the order the spec lists the screens (section 12). */
export const navigation: NavigationItem[] = [
  { to: '/', label: 'nav.dashboard', tabIcon: LayoutDashboard },
  { to: '/transactions', label: 'nav.transactions', tabIcon: ArrowLeftRight },
  { to: '/accounts', label: 'nav.accounts' },
  { to: '/budgets', label: 'nav.budgets', tabIcon: PiggyBank },
  { to: '/reports', label: 'nav.reports', tabIcon: ChartPie },
  { to: '/recurring', label: 'nav.recurring' },
  { to: '/import', label: 'nav.import' },
  { to: '/settings', label: 'nav.settings' },
]

/** Wide enough for the sidebar; narrower screens get the bottom tab bar. Tailwind's `md`. */
export const sidebarQuery = '(min-width: 768px)'
