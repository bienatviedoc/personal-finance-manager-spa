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

/**
 * Writes a moment the API sent (an ISO timestamp, such as when an audit entry was written or a statement uploaded)
 * as its date and time in a time zone, such as the user's: `formatMoment('2026-11-19T20:00:00Z', 'en',
 * 'Asia/Ho_Chi_Minh')` is `Nov 20, 2026, 3:00 AM`. With `time: false`, the date alone, as `formatDate` writes one.
 */
export function formatMoment(moment: string, locale: Language, timeZone: string, { time = true }: { time?: boolean } = {}): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: time ? 'short' : undefined, timeZone }).format(new Date(moment))
}

/** The calendar date a number of days after this one, or before it when negative. */
export function shiftDate(date: CalendarDate, days: number): CalendarDate {
  // Worked out in UTC, where every day is as long as any other, so no time zone or clock change moves it.
  const shifted = new Date(`${date}T00:00:00Z`)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return shifted.toISOString().slice(0, 10)
}

/** Today's calendar date in a time zone (an IANA id such as `Asia/Ho_Chi_Minh`), such as the user's. */
export function todayIn(timeZone: string, now: Date = new Date()): CalendarDate {
  // en-CA writes dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
