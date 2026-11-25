import { queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { components } from '@/shared/api/schema'
import type { ReportQuery } from '../frame/useReportFilters'
import { reportsKey } from './reports'

export type Trend = components['schemas']['TrendResponse']
export type TrendMonth = components['schemas']['TrendMonthResponse']
export type PeriodChange = components['schemas']['PeriodChangeResponse']
/** What a payee alone is followed by: what was spent with it, or the income received from it. */
export type TrendType = 'expense' | 'income'

/**
 * One category or one payee over time (spec RPT-7): its total in each month of the report period and how each
 * changed from the month before, and with `compare` the period before, each of its months at the same place as one
 * of the period's. A payee alone is followed by what was spent with it unless `type` is income. Every figure is the API's.
 */
export const trendQuery = (query: ReportQuery, payee?: string, type?: TrendType) =>
  queryOptions({
    queryKey: [...reportsKey, 'trends', query, payee ?? null, type ?? null],
    queryFn: async () => {
      const { data, response } = await api.GET('/api/v1/reports/trends', { params: { query: { ...query, ...(payee && { payee }), ...(type && { type }) } } })
      if (!data) throw new Error(`Could not load the trend: ${response.status}`)
      return data
    },
  })
