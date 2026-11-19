import { describe, expect, it } from 'vitest'
import { formatMoney } from './formatMoney'

// Intl separates a number from its currency symbol with a no-break space.
const nbsp = ' '

describe('formatMoney', () => {
  it.each([
    ['VND', 'en', '₫1,234,568'],
    ['VND', 'vi', `1.234.568${nbsp}₫`],
    ['USD', 'en', '$1,234,567.89'],
    ['USD', 'vi', `1.234.567,89${nbsp}US$`],
    ['EUR', 'en', '€1,234,567.89'],
    ['EUR', 'vi', `1.234.567,89${nbsp}€`],
  ] as const)('writes %s in %s', (currency, locale, expected) => {
    expect(formatMoney('1234567.89', currency, locale)).toBe(expected)
  })

  it('shows VND with no decimals and the other currencies with two', () => {
    expect(formatMoney('125000', 'VND', 'vi')).toBe(`125.000${nbsp}₫`)
    expect(formatMoney('12', 'USD', 'en')).toBe('$12.00')
    expect(formatMoney('0.5', 'EUR', 'vi')).toBe(`0,50${nbsp}€`)
  })

  it('keeps every digit of an amount too large for a JavaScript number', () => {
    expect(formatMoney('9007199254740993.01', 'USD', 'en')).toBe('$9,007,199,254,740,993.01')
  })

  it('writes a negative amount with its sign', () => {
    expect(formatMoney('-1500.00', 'USD', 'en')).toBe('-$1,500.00')
    expect(formatMoney('-1500', 'VND', 'vi')).toBe(`-1.500${nbsp}₫`)
  })

  it('refuses anything that is not a decimal string', () => {
    expect(() => formatMoney('1,500', 'USD', 'en')).toThrow()
    expect(() => formatMoney('', 'USD', 'en')).toThrow()
    expect(() => formatMoney('NaN', 'USD', 'en')).toThrow()
  })
})
