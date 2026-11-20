import type { Language } from '@/shared/i18n'

/** A calendar date with no time, as the API sends it: `YYYY-MM-DD`. */
export type CalendarDate = string

export const calendarDatePattern = /^\d{4}-\d{2}-\d{2}$/

/**
 * Writes a calendar date the way the locale does: `formatDate('2026-11-19', 'vi')` is `19 thg 11, 2026`
 * (`medium`) or `19/11/26` (`short`). A calendar date has no time and no time zone, so it never shifts
 * to the day before or after.
 */
export function formatDate(date: CalendarDate, locale: Language, style: 'short' | 'medium' | 'long' = 'medium'): string {
  if (!calendarDatePattern.test(date)) throw new Error('formatDate expects a calendar date such as "2026-11-19".')
  // Read and written in UTC, so the browser's own time zone cannot move it.
  return new Intl.DateTimeFormat(locale, { dateStyle: style, timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
}

/** Today's calendar date in a time zone (an IANA id such as `Asia/Ho_Chi_Minh`), such as the user's. */
export function todayIn(timeZone: string, now: Date = new Date()): CalendarDate {
  // en-CA writes dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
