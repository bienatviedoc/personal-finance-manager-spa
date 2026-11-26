import { lazy } from 'react'
import type { RouteObject } from 'react-router'

/**
 * Loads the reports screen. It is loaded when first opened: the charting library it draws with is the largest
 * thing the app has. Tests load it before they start, so that is not part of what they wait for.
 */
export const loadReportsScreen = () => import('./routes/ReportsPage')

export const reportsRoutes: RouteObject[] = [{ path: 'reports/:report?', lazy: async () => ({ Component: (await loadReportsScreen()).ReportsPage }) }]

export { refreshReports } from './api/reports'

/** Loads an account's balance chart, which draws with the charting library too. Tests load it before they start. */
export const loadAccountBalance = () => import('./cashFlow/AccountBalance')

/** One account's running balance over a period, as a line or a table (spec RPT-4), loaded when first shown. */
export const AccountBalance = lazy(async () => ({ default: (await loadAccountBalance()).AccountBalance }))
