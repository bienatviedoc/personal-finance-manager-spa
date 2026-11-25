import { describe, expect, it } from 'vitest'
import { periodOf } from './reportPeriod'

describe('the report period of a preset', () => {
  const today = '2026-11-23'

  it.each([
    ['thisMonth', '2026-11-01', '2026-11-30'],
    ['lastMonth', '2026-10-01', '2026-10-31'],
    ['last3Months', '2026-09-01', '2026-11-30'],
    ['last6Months', '2026-06-01', '2026-11-30'],
    ['last12Months', '2025-12-01', '2026-11-30'],
    ['thisYear', '2026-01-01', '2026-12-31'],
    ['lastYear', '2025-01-01', '2025-12-31'],
  ] as const)('%s runs from %s to %s, in whole calendar months', (preset, from, to) => {
    expect(periodOf(preset, today)).toEqual({ from, to })
  })

  it('knows how long each month is, February of a leap year too', () => {
    expect(periodOf('lastMonth', '2028-03-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
    expect(periodOf('thisMonth', '2026-02-01')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })

  it('crosses into the year before', () => {
    expect(periodOf('lastMonth', '2027-01-05')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(periodOf('last3Months', '2027-01-05')).toEqual({ from: '2026-11-01', to: '2027-01-31' })
  })
})
