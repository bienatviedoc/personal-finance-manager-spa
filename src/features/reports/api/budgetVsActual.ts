import { queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { components } from '@/shared/api/schema'
import type { ReportQuery } from '../frame/useReportFilters'
import { reportsKey } from './reports'

export type BudgetVsActual = components['schemas']['BudgetVsActualResponse']
export type BudgetVsActualItem = components['schemas']['BudgetVsActualItemResponse']
export type UnbudgetedSpending = components['schemas']['UnbudgetedSpendingResponse']
export type BudgetVsActualState = components['schemas']['BudgetVsActualState']

/**
 * Budgeted against spent per category (spec RPT-6), over the whole budget months the period touches, summed when
 * there are several, and apart from it what was spent where no budget covered it. Never compared with the period
 * before. Every figure and state is the API's.
 */
export const budgetVsActualQuery = ({ from, to, accountId, categoryId }: ReportQuery) =>
  queryOptions({
    queryKey: [...reportsKey, 'budget-vs-actual', { from, to, accountId, categoryId }],
    queryFn: async () => {
      const query = { from, to, ...(accountId && { accountId }), ...(categoryId && { categoryId }) }
      const { data, response } = await api.GET('/api/v1/reports/budget-vs-actual', { params: { query } })
      if (!data) throw new Error(`Could not load budget vs actual: ${response.status}`)
      return data
    },
  })
