import type { Language } from '@/shared/i18n'
import { type Currency, type DecimalString, decimalPattern } from './currencies'

const formatters = new Map<string, Intl.NumberFormat>()

/**
 * The Intl formatter for a currency in a locale, cached because creating one is slow. A signed one writes a plus
 * sign before an amount above zero too, for a change.
 */
export function currencyFormat(currency: Currency, locale: Language, signed = false): Intl.NumberFormat {
  const key = `${locale}:${currency}:${signed}`
  let format = formatters.get(key)
  if (!format) {
    format = new Intl.NumberFormat(locale, { style: 'currency', currency, ...(signed && { signDisplay: 'exceptZero' as const }) })
    formatters.set(key, format)
  }
  return format
}

/**
 * Writes an amount in a currency the way the locale does: `formatMoney('125000', 'VND', 'vi')` is
 * `125.000 ₫`. Each currency shows its own number of decimals (none for VND), rounding half away from zero.
 * The decimal string goes to `Intl` as it is, never through a JavaScript `number`, so no digit is lost. Signed,
 * an amount above zero has a plus sign, as a change does: `+₫50,000`.
 */
export function formatMoney(amount: DecimalString, currency: Currency, locale: Language, signed = false): string {
  // The message leaves out the amount: error reports must not carry financial content.
  if (!decimalPattern.test(amount)) throw new Error('formatMoney expects a decimal string such as "125000.00".')
  return currencyFormat(currency, locale, signed).format(amount as Intl.StringNumericLiteral)
}

/**
 * Writes a number on a chart's axis short, as the locale does: `1.2M`, `1,2 Tr`. The one place an amount is a
 * JavaScript number is a chart, for drawing alone, and its ticks are a scale, not amounts anyone reads exactly:
 * the table or legend beside the chart gives those with `<Money>`.
 */
export function formatAxisAmount(value: number, locale: Language): string {
  return new Intl.NumberFormat(locale, { notation: 'compact' }).format(value)
}
