import type { RouteObject } from 'react-router'

export const reportsRoutes: RouteObject[] = [
  // Loaded when first opened: the charting library it draws with is the largest thing the app has.
  { path: 'reports/:report?', lazy: async () => ({ Component: (await import('./routes/ReportsPage')).ReportsPage }) },
]

export { refreshReports } from './api/spendingByCategory'
