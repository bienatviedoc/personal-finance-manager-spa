import { describe, expect, it } from 'vitest'
import { formatDate, todayIn } from './formatDate'

describe('formatDate', () => {
  it.each([
    ['en', 'medium', 'Nov 19, 2026'],
    ['vi', 'medium', '19 thg 11, 2026'],
    ['en', 'short', '11/19/26'],
    ['vi', 'short', '19/11/26'],
  ] as const)('writes a calendar date in %s (%s)', (locale, style, expected) => {
    expect(formatDate('2026-11-19', locale, style)).toBe(expected)
  })

  it('refuses anything that is not a calendar date', () => {
    expect(() => formatDate('19/11/2026', 'en')).toThrow()
  })
})

describe('todayIn', () => {
  it('is the date where the user is, not where the browser is', () => {
    // 20:00 UTC on 19 November is already 03:00 on 20 November in Vietnam.
    const now = new Date('2026-11-19T20:00:00Z')

    expect(todayIn('Asia/Ho_Chi_Minh', now)).toBe('2026-11-20')
    expect(todayIn('Europe/London', now)).toBe('2026-11-19')
  })
})
