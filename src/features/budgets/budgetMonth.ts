import type { Language } from '@/shared/i18n'

/** A budget month as the API and the address write it: `2026-11`, the calendar month from the 1st. */
export type BudgetMonth = string

const pattern = /^(\d{4})-(0[1-9]|1[0-2])$/

export function isBudgetMonth(text: string | undefined): text is BudgetMonth {
  return text !== undefined && pattern.test(text)
}

/** The budget month a number of months after this one, or before it when negative. */
export function shiftMonth(month: BudgetMonth, by: number): BudgetMonth {
  const [, year, monthOfYear] = pattern.exec(month)!
  const months = Number(year) * 12 + (Number(monthOfYear) - 1) + by
  return `${String(Math.floor(months / 12)).padStart(4, '0')}-${String((months % 12) + 1).padStart(2, '0')}`
}

/** Writes a budget month the way the locale does: `November 2026`, `tháng 11 năm 2026`. */
export function formatMonth(month: BudgetMonth, locale: Language): string {
  // Read and written in UTC, so the browser's own time zone cannot move it into the month before.
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))
}
