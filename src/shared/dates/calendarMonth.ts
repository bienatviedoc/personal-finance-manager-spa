import type { Language } from '@/shared/i18n'
import type { CalendarDate } from './formatDate'

/**
 * A calendar month, from the 1st, as the API and the address write it: `2026-11`. Branded, so only `isCalendarMonth`,
 * `monthOf` and `shiftMonth` make one: any other text has to be checked first.
 */
export type CalendarMonth = string & { readonly __calendarMonth: true }

const pattern = /^(\d{4})-(0[1-9]|1[0-2])$/

export function isCalendarMonth(text: string | undefined): text is CalendarMonth {
  return text !== undefined && pattern.test(text)
}

/** The month a calendar date is in. */
export function monthOf(date: CalendarDate): CalendarMonth {
  return date.slice(0, 7) as CalendarMonth
}

/** The month a number of months after this one, or before it when negative. */
export function shiftMonth(month: CalendarMonth, by: number): CalendarMonth {
  const [, year, monthOfYear] = pattern.exec(month)!
  const months = Number(year) * 12 + (Number(monthOfYear) - 1) + by
  return `${String(Math.floor(months / 12)).padStart(4, '0')}-${String((months % 12) + 1).padStart(2, '0')}` as CalendarMonth
}

/** Writes a month the way the locale does: `November 2026`, `tháng 11 năm 2026`; short, `Nov 2026`, `thg 11 2026`. */
export function formatMonth(month: CalendarMonth, locale: Language, style: 'long' | 'short' = 'long'): string {
  // Read and written in UTC, so the browser's own time zone cannot move it into the month before.
  return new Intl.DateTimeFormat(locale, { month: style, year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))
}
