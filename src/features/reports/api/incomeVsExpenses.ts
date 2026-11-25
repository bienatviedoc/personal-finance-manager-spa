import { queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { components } from '@/shared/api/schema'
import type { ReportQuery } from '../frame/useReportFilters'
import { reportsKey } from './reports'

export type IncomeVsExpenses = components['schemas']['IncomeVsExpensesResponse']
export type IncomeAndExpenses = components['schemas']['IncomeAndExpensesResponse']
export type MonthIncomeAndExpenses = components['schemas']['MonthIncomeAndExpensesResponse']

/**
 * Am I saving (spec RPT-3): income, expenses and net in each month of the report period, with the savings rate, and
 * the same over the whole period, in the base currency. Every figure is the API's; nothing is added up here.
 */
export const incomeVsExpensesQuery = (query: ReportQuery) =>
  queryOptions({
    queryKey: [...reportsKey, 'income-vs-expenses', query],
    queryFn: async () => {
      const { data, response } = await api.GET('/api/v1/reports/income-vs-expenses', { params: { query } })
      if (!data) throw new Error(`Could not load income vs expenses: ${response.status}`)
      return data
    },
  })
