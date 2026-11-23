import type { Language } from '@/shared/i18n'
import { type Currency, type DecimalString } from './currencies'
import { currencyFormat } from './formatMoney'

/** The API stores amounts as numeric(19,4): at most 15 digits before the decimal point. */
const maxIntegerDigits = 15

/** The characters a locale writes between groups of thousands and before the decimals. */
function separators(locale: Language): { group: string; decimal: string } {
  const parts = new Intl.NumberFormat(locale).formatToParts(1234567.5)
  return {
    group: parts.find((part) => part.type === 'group')?.value ?? ',',
    decimal: parts.find((part) => part.type === 'decimal')?.value ?? '.',
  }
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Reads an amount the user typed, in their locale's separators, into a decimal string:
 * `parseAmount('1.200.000,5', 'vi', 'EUR')` is `"1200000.5"`. Returns null when the text is not an amount:
 * empty, negative, separators misplaced (groups of thousands must be whole), or more decimals than the
 * currency has (VND has none). Never goes through a JavaScript `number`.
 *
 * Only where a balance can be below zero (an overdrawn account's opening balance) does `allowNegative` let a
 * minus sign lead the amount: `"-250000"`. Amounts owed and transaction amounts stay positive.
 */
export function parseAmount(text: string, locale: Language, currency: Currency, { allowNegative = false } = {}): DecimalString | null {
  const { group, decimal } = separators(locale)
  const grouped = `\\d{1,3}(?:${escape(group)}\\d{3})+`
  // A hyphen, or the minus sign some keyboards and locales write.
  const match = new RegExp(`^([-\u2212]\\s*)?(${grouped}|\\d+)(?:${escape(decimal)}(\\d+))?$`).exec(text.trim())
  if (!match) return null
  if (match[1] && !allowNegative) return null

  const integer = match[2]!.replaceAll(group, '').replace(/^0+(?=\d)/, '')
  const fraction = match[3]
  if (integer.length > maxIntegerDigits) return null
  if (fraction && fraction.length > decimalsOf(currency, locale)) return null

  const amount = fraction ? `${integer}.${fraction}` : integer
  // Minus nothing is nothing.
  return match[1] && /[1-9]/.test(amount) ? `-${amount}` : amount
}

/**
 * Writes a decimal string the way the locale writes numbers, with no currency symbol: what an amount input
 * shows. The API sends more decimals than a currency has (`"125000.00"` for VND, `"12.5000"` for USD), so
 * zeros beyond the currency's own are left out and `parseAmount` reads the text back to the same amount.
 * Decimals the currency lacks that are not zero (`"125000.50"` for VND) are shown, never rounded away, and
 * read back as not an amount for the user to correct.
 */
export function formatAmountForInput(amount: DecimalString, locale: Language, currency: Currency): string {
  let fraction = amount.split('.')[1] ?? ''
  while (fraction.length > decimalsOf(currency, locale) && fraction.endsWith('0')) fraction = fraction.slice(0, -1)
  const decimals = fraction.length
  return new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(
    amount as Intl.StringNumericLiteral,
  )
}

/** How many decimals the currency has: none for VND, two for USD and EUR. */
export function decimalsOf(currency: Currency, locale: Language): number {
  return currencyFormat(currency, locale).resolvedOptions().maximumFractionDigits ?? 0
}

/** The currency with the most decimals, in which an amount in any of them can be typed; undefined when there are none. */
export function withMostDecimals(currencies: Currency[], locale: Language): Currency | undefined {
  return currencies.toSorted((a, b) => decimalsOf(b, locale) - decimalsOf(a, locale))[0]
}
