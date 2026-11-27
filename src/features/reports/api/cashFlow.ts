import { queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { components } from '@/shared/api/schema'
import type { ReportQuery } from '../frame/useReportFilters'
import { reportsKey } from './reports'

export type CashFlow = components['schemas']['CashFlowResponse']
export type BalanceInterval = components['schemas']['BalanceInterval']

/** Every interval, daily first, the default. */
export const balanceIntervals = ['day', 'week'] as const satisfies readonly BalanceInterval[]

/**
 * How a balance moved over a period (spec RPT-4): the running balance at the end of every day, or of every week
 * and of the period's last day. With an account, that account's in its own currency; without, all of them,
 * archived ones included, in the base currency. Made of balances, so no category and no comparing. Every
 * balance is the API's.
 */
export const cashFlowQuery = ({ from, to, accountId, interval = 'day' }: Pick<ReportQuery, 'from' | 'to' | 'accountId'> & { interval?: BalanceInterval }) =>
  queryOptions({
    queryKey: [...reportsKey, 'cash-flow', { from, to, accountId: accountId ?? null, interval }],
    queryFn: async () => {
      const { data, response } = await api.GET('/api/v1/reports/cash-flow', {
        params: { query: { from, to, ...(accountId && { accountId }), ...(interval !== 'day' && { interval }) } },
      })
      if (!data) throw new Error(`Could not load cash flow: ${response.status}`)
      return data
    },
  })
