import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { useUserSettings } from '@/features/settings'
import { calendarDatePattern, todayIn, type CalendarDate } from '@/shared/dates'
import { periodOf, periodPresets, type PeriodChoice, type ReportPeriod } from './reportPeriod'

/** How a report shows its numbers: as a chart, or as a table of the same numbers (spec section 7). */
export type ReportView = 'chart' | 'table'

/**
 * What every report is filtered by (spec section 7), as the address holds it and the API reads it: the period
 * chosen and the dates it covers, the account and category filters, whether to compare with the period
 * before, and the view.
 */
export type ReportFilters = ReportPeriod & {
  period: PeriodChoice
  accountId?: string
  categoryId?: string
  compare: boolean
  view: ReportView
}

/** What the API takes of the filters: the view is the screen's alone. */
export type ReportQuery = Pick<ReportFilters, 'from' | 'to' | 'accountId' | 'categoryId'> & { compare?: true }

/** A filter changed; undefined takes it out of the address. */
export type ReportFilterChanges = Partial<ReportFilters>

const defaultPeriod = 'thisMonth'

/**
 * The filters of a report, kept in the address (spec section 7, "filters live in the URL"), so a report view can
 * be bookmarked and opened again. A preset is kept by name and worked out again on the day it is opened, so a
 * bookmark of this month always shows the month it is; dates the user chose are kept as they are. What the
 * address holds that is not a filter (a hand-edited date, a period that does not exist) is left out, as if it
 * were not there. Anything else in the address is left as it is, except how far the report is drilled down
 * (`drillDown`, the names it keeps that in): another category filter starts that again, since what was drilled
 * into may no longer be in the report.
 */
export function useReportFilters(drillDown: readonly string[] = []) {
  const [params, setParams] = useSearchParams()
  const { timeZone } = useUserSettings()
  const today = todayIn(timeZone)
  const filters = useMemo(() => read(params, today), [params, today])
  // What the address was last set to. The router's own `current` is the address as of the last render, so a
  // second change made before the screen renders again (picking a category, then ticking compare) would
  // otherwise undo the first.
  const latest = useRef(params)
  useLayoutEffect(() => {
    latest.current = params
  }, [params])

  const change = useCallback(
    (changes: ReportFilterChanges) => {
      const current = latest.current
      const next = new URLSearchParams(current)
      const now = read(current, today)
      const set = (name: string, value: string | undefined) => (value ? next.set(name, value) : next.delete(name))

      if ('period' in changes) {
        set('period', changes.period === defaultPeriod ? undefined : changes.period)
        // Choosing dates starts from the ones the report shows; a preset needs none.
        set('from', changes.period === 'custom' ? now.from : undefined)
        set('to', changes.period === 'custom' ? now.to : undefined)
      }
      if (changes.from !== undefined || changes.to !== undefined) {
        set('period', 'custom')
        set('from', changes.from ?? now.from)
        set('to', changes.to ?? now.to)
      }
      if ('accountId' in changes) set('accountId', changes.accountId)
      if ('categoryId' in changes && changes.categoryId !== now.categoryId) {
        set('categoryId', changes.categoryId)
        for (const name of drillDown) next.delete(name)
      }
      if ('compare' in changes) set('compare', changes.compare ? 'true' : undefined)
      if ('view' in changes) set('view', changes.view === 'table' ? 'table' : undefined)
      latest.current = next
      // A report is one screen, however many filters it took to get to it: Back leaves it.
      setParams(next, { replace: true })
    },
    [setParams, today, drillDown],
  )

  return { filters, change }
}

/** What the API is asked for under the filters. */
export function reportQuery({ from, to, accountId, categoryId, compare }: ReportFilters): ReportQuery {
  return { from, to, ...(accountId && { accountId }), ...(categoryId && { categoryId }), ...(compare && { compare: true }) }
}

function read(params: URLSearchParams, today: CalendarDate): ReportFilters {
  const date = (name: string) => {
    const value = params.get(name)
    return value && calendarDatePattern.test(value) ? value : undefined
  }
  const [from, to] = [date('from'), date('to')]
  const asked = params.get('period')
  const preset = periodPresets.find((each) => each === asked)
  const custom = (asked === 'custom' || asked === null) && from !== undefined && to !== undefined && from <= to

  return {
    ...(custom ? { period: 'custom' as const, from, to } : { period: preset ?? defaultPeriod, ...periodOf(preset ?? defaultPeriod, today) }),
    ...(params.get('accountId') && { accountId: params.get('accountId')! }),
    ...(params.get('categoryId') && { categoryId: params.get('categoryId')! }),
    compare: params.get('compare') === 'true',
    view: params.get('view') === 'table' ? 'table' : 'chart',
  }
}
