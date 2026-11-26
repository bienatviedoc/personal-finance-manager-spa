import { http, HttpResponse } from 'msw'
import type { components } from '@/shared/api/schema'
import { apiUrl as url, problem, server } from './server'

type DashboardResponse = components['schemas']['DashboardResponse']

/** The dashboard of a new user: no accounts, nothing this month, no budgets, nothing recorded or coming up. */
export const emptyDashboard: DashboardResponse = {
  from: '2026-11-01',
  to: '2026-11-30',
  currency: 'VND',
  hasAccounts: false,
  balance: { balance: '0.00', notConverted: [] },
  thisMonth: { income: '0.00', expenses: '0.00', net: '0.00', savingsRate: null, notConverted: 0 },
  budgets: null,
  topCategories: [],
  recentTransactions: [],
  upcoming: [],
}

/**
 * A stand-in for `GET /api/v1/reports/dashboard`. The dashboard is an aggregate the API works out from what the
 * other screens and reports show (see the API's DashboardTests), so the fake answers what a test gives it, over
 * the dashboard of a new user, rather than working it out again. It counts how often it was asked, can fail, and
 * can hold its answer back until `release`, for a test of what shows while it loads.
 */
export function fakeDashboardApi(dashboard: Partial<DashboardResponse> = {}, { held = false } = {}) {
  let release: () => void = () => {}
  const answered = held ? new Promise<void>((resolve) => (release = resolve)) : Promise.resolve()
  const state = {
    dashboard: { ...emptyDashboard, ...dashboard },
    /** How many times the dashboard was asked for. */
    asked: 0,
    /** When set, the dashboard is answered with this status. */
    failWith: undefined as number | undefined,
    /** Answers a held dashboard. */
    release: () => release(),
  }

  server.use(
    http.get(url('/api/v1/reports/dashboard'), async () => {
      state.asked += 1
      await answered
      if (state.failWith) return problem(state.failWith)
      return HttpResponse.json(state.dashboard)
    }),
  )

  return state
}
