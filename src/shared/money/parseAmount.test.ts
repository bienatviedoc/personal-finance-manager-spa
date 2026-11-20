import { describe, expect, it } from 'vitest'
import { formatAmountForInput, parseAmount } from './parseAmount'

describe('parseAmount', () => {
  describe.each([
    // locale, what the user types for one million two hundred thousand and a half
    ['en', '1,200,000.5'],
    ['vi', '1.200.000,5'],
  ] as const)('in %s', (locale, typed) => {
    it('reads the locale’s group and decimal separators into a decimal string', () => {
      expect(parseAmount(typed, locale, 'USD')).toBe('1200000.5')
      expect(parseAmount(typed, locale, 'EUR')).toBe('1200000.5')
    })

    it('reads an amount typed without group separators', () => {
      expect(parseAmount(typed.replaceAll(locale === 'en' ? ',' : '.', ''), locale, 'USD')).toBe('1200000.5')
    })

    it('refuses decimals in VND, which has none', () => {
      expect(parseAmount(typed, locale, 'VND')).toBeNull()
      expect(parseAmount(typed.split(locale === 'en' ? '.' : ',')[0]!, locale, 'VND')).toBe('1200000')
    })
  })

  it.each([
    ['en', '125000', 'VND', '125000'],
    ['vi', '125.000', 'VND', '125000'],
    ['en', '125.000', 'VND', null],
    ['en', '12.34', 'USD', '12.34'],
    ['vi', '12,34', 'USD', '12.34'],
    ['en', '12,34', 'USD', null],
    ['en', '0.5', 'EUR', '0.5'],
    ['vi', '0,50', 'EUR', '0.50'],
    ['en', '12.345', 'USD', null],
    ['vi', '1.5', 'EUR', null],
    ['en', '  42  ', 'USD', '42'],
    ['en', '007', 'USD', '7'],
    ['en', '0', 'USD', '0'],
    ['en', '', 'USD', null],
    ['en', '-5', 'USD', null],
    ['en', '1,2345', 'USD', null],
    ['en', '1e5', 'USD', null],
    ['en', '12.', 'USD', null],
    ['en', '.5', 'USD', null],
    ['en', '1234567890123456', 'USD', null],
    ['en', '123456789012345', 'USD', '123456789012345'],
  ] as const)('in %s reads "%s" (%s) as %s', (locale, typed, currency, expected) => {
    expect(parseAmount(typed, locale, currency)).toBe(expected)
  })
})

describe('parseAmount, where an amount may be negative', () => {
  it.each([
    ['en', '-250,000', 'VND', '-250000'],
    ['vi', '-1.200,5', 'USD', '-1200.5'],
    // The minus sign some keyboards and Intl write.
    ['en', '\u2212 12.5', 'USD', '-12.5'],
    ['en', '42', 'USD', '42'],
    ['en', '-0', 'USD', '0'],
    ['en', '--5', 'USD', null],
    ['en', '5-', 'USD', null],
    ['en', '-', 'USD', null],
    ['en', '-12.345', 'USD', null],
  ] as const)('in %s reads "%s" (%s) as %s', (locale, typed, currency, expected) => {
    expect(parseAmount(typed, locale, currency, { allowNegative: true })).toBe(expected)
  })

  it.each(['en', 'vi'] as const)('reads back in %s what the input shows for a negative amount', (locale) => {
    expect(parseAmount(formatAmountForInput('-1250000.50', locale, 'USD'), locale, 'USD', { allowNegative: true })).toBe('-1250000.50')
  })
})

describe('formatAmountForInput', () => {
  it.each([
    ['125000.50', 'vi', 'VND', '125.000,5'],
    ['12.3456', 'en', 'USD', '12.3456'],
  ] as const)('shows %s in %s for %s as %s, not rounded, which reads back as not an amount', (amount, locale, currency, expected) => {
    expect(formatAmountForInput(amount, locale, currency)).toBe(expected)
    expect(parseAmount(expected, locale, currency)).toBeNull()
  })

  it.each([
    ['1200000.5', 'en', '1,200,000.5'],
    ['1200000.5', 'vi', '1.200.000,5'],
    ['125000', 'vi', '125.000'],
    ['0.50', 'en', '0.50'],
    ['999999999999999.99', 'en', '999,999,999,999,999.99'],
  ] as const)('writes %s in %s as %s, which reads back the same', (amount, locale, expected) => {
    expect(formatAmountForInput(amount, locale, 'USD')).toBe(expected)
    expect(parseAmount(expected, locale, 'USD')).toBe(amount)
  })

  it.each([
    ['125000.00', 'vi', 'VND', '125.000', '125000'],
    ['125000.0000', 'en', 'VND', '125,000', '125000'],
    ['12.5000', 'en', 'USD', '12.50', '12.50'],
    ['12.5000', 'vi', 'EUR', '12,50', '12.50'],
    ['1200000.0000', 'en', 'USD', '1,200,000.00', '1200000.00'],
  ] as const)('writes %s in %s for %s as %s, leaving out zeros the currency does not have', (amount, locale, currency, expected, readBack) => {
    expect(formatAmountForInput(amount, locale, currency)).toBe(expected)
    expect(parseAmount(expected, locale, currency)).toBe(readBack)
  })
})
