import { monthOf, shiftMonth, type CalendarDate, type CalendarMonth } from '@/shared/dates'

/** The ready-made report periods (spec section 7, common behaviour), each in whole calendar months. */
export const periodPresets = ['thisMonth', 'lastMonth', 'last3Months', 'last6Months', 'last12Months', 'thisYear', 'lastYear'] as const

export type PeriodPreset = (typeof periodPresets)[number]

/** A preset, or dates the user chose themselves. */
export type PeriodChoice = PeriodPreset | 'custom'

/** Every choice of period, in the order the filter offers them. */
export const periodChoices: readonly PeriodChoice[] = [...periodPresets, 'custom']

/** The dates a report covers, both included, as the API's `from` and `to` take them. */
export type ReportPeriod = { from: CalendarDate; to: CalendarDate }

/**
 * The dates a preset covers on a day, which is today in the user's time zone. Every preset is whole calendar
 * months, this month included, so a period and the one the API compares it with line up: the last 3 months in
 * November are September to November, compared with June to August.
 */
export function periodOf(preset: PeriodPreset, today: CalendarDate): ReportPeriod {
  const thisMonth = monthOf(today)
  const year = Number(today.slice(0, 4))
  const months = (first: CalendarMonth, last: CalendarMonth): ReportPeriod => ({ from: `${first}-01`, to: lastDayOf(last) })
  const lastMonths = (count: number) => months(shiftMonth(thisMonth, 1 - count), thisMonth)

  switch (preset) {
    case 'thisMonth':
      return lastMonths(1)
    case 'lastMonth':
      return months(shiftMonth(thisMonth, -1), shiftMonth(thisMonth, -1))
    case 'last3Months':
      return lastMonths(3)
    case 'last6Months':
      return lastMonths(6)
    case 'last12Months':
      return lastMonths(12)
    case 'thisYear':
      return { from: `${year}-01-01`, to: `${year}-12-31` }
    case 'lastYear':
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` }
  }
}

function lastDayOf(month: CalendarMonth): CalendarDate {
  const [year, monthOfYear] = [Number(month.slice(0, 4)), Number(month.slice(5, 7))]
  // Day 0 of the month after is the last day of this one; read in UTC, so no time zone moves it.
  const day = new Date(Date.UTC(year, monthOfYear, 0)).getUTCDate()
  return `${month}-${String(day).padStart(2, '0')}`
}
