import type { RouteObject } from 'react-router'

/**
 * Loads the reports screen. It is loaded when first opened: the charting library it draws with is the largest
 * thing the app has. Tests load it before they start, so that is not part of what they wait for.
 */
export const loadReportsScreen = () => import('./routes/ReportsPage')

export const reportsRoutes: RouteObject[] = [{ path: 'reports/:report?', lazy: async () => ({ Component: (await loadReportsScreen()).ReportsPage }) }]

export { refreshReports } from './api/reports'
