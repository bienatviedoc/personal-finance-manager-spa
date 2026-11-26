import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { components } from '@/shared/api/schema'

export type Dashboard = components['schemas']['DashboardResponse']
export type DashboardBudgets = components['schemas']['DashboardBudgetsResponse']
export type DashboardTransaction = components['schemas']['DashboardTransactionResponse']
export type DashboardOccurrence = components['schemas']['DashboardOccurrenceResponse']
/** A budget's state as the dashboard answers it, the overall budget's too. */
export type BudgetState = DashboardBudgets['needingAttention'][number]['state']

const dashboardKey = ['dashboard']

/**
 * The whole dashboard in one request (spec RPT-1): the total balance, this month's income, expenses and net, budget
 * status, top categories, the latest transactions and what is coming up. Every figure is the API's. It is loaded
 * again each time the screen opens, as nearly anything done on another screen moves something it shows.
 */
export const dashboardQuery = () =>
  queryOptions({
    queryKey: dashboardKey,
    queryFn: async () => {
      const { data, response } = await api.GET('/api/v1/reports/dashboard')
      if (!data) throw new Error(`Could not load the dashboard: ${response.status}`)
      return data
    },
    staleTime: 0,
  })

/** Loads the dashboard again, for a change made while it is open: recording a transaction with quick add. */
export function refreshDashboard(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: dashboardKey })
}
