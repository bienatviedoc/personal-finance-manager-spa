import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { components } from '@/shared/api/schema'

export type Dashboard = components['schemas']['DashboardResponse']
export type DashboardBudgets = components['schemas']['DashboardBudgetsResponse']
export type DashboardTransaction = components['schemas']['DashboardTransactionResponse']
export type DashboardOccurrence = components['schemas']['DashboardOccurrenceResponse']

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

/** Whether a transaction takes its amount from the balance, and so is shown with a minus: an expense that is not a refund, or a transfer out. */
export const takesFromBalance = ({ type, isRefund }: Pick<DashboardTransaction, 'type' | 'isRefund'>) =>
  (type === 'expense' && !isRefund) || type === 'transferOut'
