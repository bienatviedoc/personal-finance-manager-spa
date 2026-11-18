import type { ParseKeys } from 'i18next'

export type NavigationItem = { to: string; label: ParseKeys }

/** The main sidebar, in the order the spec lists the screens (section 12). */
export const navigation: NavigationItem[] = [
  { to: '/', label: 'nav.dashboard' },
  { to: '/transactions', label: 'nav.transactions' },
  { to: '/accounts', label: 'nav.accounts' },
  { to: '/budgets', label: 'nav.budgets' },
  { to: '/reports', label: 'nav.reports' },
  { to: '/recurring', label: 'nav.recurring' },
  { to: '/import', label: 'nav.import' },
  { to: '/settings', label: 'nav.settings' },
]
