import { describe, expect, it } from 'vitest'
import { daysOf, formatMonth, isCalendarMonth, monthOf, shiftMonth, type CalendarMonth } from './calendarMonth'

const november = '2026-11' as CalendarMonth

describe('calendar months', () => {
  it('reads only a year and a month from 01 to 12', () => {
    expect(isCalendarMonth('2026-11')).toBe(true)
    expect(['2026-13', '2026-1', '2026-11-01', 'november', undefined].some(isCalendarMonth)).toBe(false)
  })

  it('takes the month of a calendar date', () => {
    expect(monthOf('2026-11-30')).toBe('2026-11')
  })

  it('moves across the turn of a year either way', () => {
    expect(shiftMonth(november, 2)).toBe('2027-01')
    expect(shiftMonth(november, -11)).toBe('2025-12')
  })

  it('runs from its 1st to its last day, a leap day included', () => {
    expect(daysOf(november)).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(daysOf('2028-02' as CalendarMonth)).toEqual({ from: '2028-02-01', to: '2028-02-29' })
    expect(daysOf('2026-12' as CalendarMonth)).toEqual({ from: '2026-12-01', to: '2026-12-31' })
  })

  it('writes the month in the locale', () => {
    expect(formatMonth(november, 'en')).toBe('November 2026')
    expect(formatMonth(november, 'vi')).toBe('tháng 11 năm 2026')
  })
})
