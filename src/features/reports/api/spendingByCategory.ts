import { queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { components } from '@/shared/api/schema'
import type { ReportQuery } from '../frame/useReportFilters'

export type SpendingByCategory = components['schemas']['SpendingByCategoryResponse']
export type CategorySpending = components['schemas']['SpendingByCategoryItemResponse']
export type SpendingTransactions = components['schemas']['SpendingTransactionsResponse']
export type SpendingTransaction = components['schemas']['SpendingTransactionResponse']
export type ReportCategory = components['schemas']['ReportCategoryResponse']

const reportsKey = ['reports']

/**
 * Where the money went over the report period (spec RPT-2): each category's spent and share of the total, ranked,
 * in the base currency; inside one top-level category with `parentId`. Every figure is the API's; nothing is
 * added up here.
 */
export const spendingByCategoryQuery = (query: ReportQuery, parentId?: string) =>
  queryOptions({
    queryKey: [...reportsKey, 'spending-by-category', query, parentId ?? null],
    queryFn: async () => {
      const { data, response } = await api.GET('/api/v1/reports/spending-by-category', { params: { query: { ...query, ...(parentId && { parentId }) } } })
      if (!data) throw new Error(`Could not load spending by category: ${response.status}`)
      return data
    },
  })

/** The expenses that make up what one category spent over the report period, each with its part, adding up to it. */
export const spendingTransactionsQuery = ({ from, to, accountId }: ReportQuery, categoryId: string) =>
  queryOptions({
    queryKey: [...reportsKey, 'spending-by-category', 'transactions', { from, to, accountId }, categoryId],
    queryFn: async () => {
      const { data, response } = await api.GET('/api/v1/reports/spending-by-category/transactions', {
        params: { query: { from, to, categoryId, ...(accountId && { accountId }) } },
      })
      if (!data) throw new Error(`Could not load the transactions of a category: ${response.status}`)
      return data
    },
  })
