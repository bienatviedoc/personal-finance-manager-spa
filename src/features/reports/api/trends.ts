import { queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { components } from '@/shared/api/schema'
import type { ReportQuery } from '../frame/useReportFilters'
import { reportsKey } from './reports'

export type Trend = components['schemas']['TrendResponse']
export type TrendMonth = components['schemas']['TrendMonthResponse']
export type PeriodChange = components['schemas']['PeriodChangeResponse']

/**
 * One category or one payee over time (spec RPT-7): its total in each month of the report period and how each
 * changed from the month before, and with `compare` the period before. Every figure is the API's.
 */
export const trendQuery = (query: ReportQuery, payee?: string) =>
  queryOptions({
    queryKey: [...reportsKey, 'trends', query, payee ?? null],
    queryFn: async () => {
      const { data, response } = await api.GET('/api/v1/reports/trends', { params: { query: { ...query, ...(payee && { payee }) } } })
      if (!data) throw new Error(`Could not load the trend: ${response.status}`)
      return data
    },
  })
