import type { TFunction } from 'i18next'
import { daysOf, formatDate, formatMonth, monthOf, type CalendarDate } from '@/shared/dates'
import type { Language } from '@/shared/i18n'

/**
 * What a month of a report is called: a calendar month by its name; in the period before one that is not whole
 * months, the days at the same place, which need not be a calendar month, by their dates (see the API's
 * `ReportPeriod.PreviousMonths`).
 */
export function monthName(month: { from: CalendarDate; to: CalendarDate }, locale: Language, t: TFunction): string {
  const calendar = daysOf(monthOf(month.from))
  return month.from === calendar.from && month.to === calendar.to
    ? formatMonth(monthOf(month.from), locale)
    : t('reports.days', { from: formatDate(month.from, locale), to: formatDate(month.to, locale) })
}
