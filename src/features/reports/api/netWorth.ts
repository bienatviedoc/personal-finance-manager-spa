import { queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { components } from '@/shared/api/schema'
import type { ReportQuery } from '../frame/useReportFilters'
import { reportsKey } from './reports'

export type NetWorth = components['schemas']['NetWorthResponse']
export type NetWorthPoint = components['schemas']['NetWorthPointResponse']

/**
 * What the user is worth over a period (spec RPT-5): the assets, the liabilities (credit cards and loans) and the
 * assets minus the liabilities at each month end, and on the period's last day when it ends inside a month.
 * Archived accounts count. Made of balances, so no category and no comparing. Every figure is the API's.
 */
export const netWorthQuery = ({ from, to, accountId }: ReportQuery) =>
  queryOptions({
    queryKey: [...reportsKey, 'net-worth', { from, to, accountId: accountId ?? null }],
    queryFn: async () => {
      const { data, response } = await api.GET('/api/v1/reports/net-worth', {
        params: { query: { from, to, ...(accountId && { accountId }) } },
      })
      if (!data) throw new Error(`Could not load net worth: ${response.status}`)
      return data
    },
  })
