import type { Language } from '@/shared/i18n'
import { type Currency, type DecimalString, decimalPattern } from './currencies'

const formatters = new Map<string, Intl.NumberFormat>()

/** The Intl formatter for a currency in a locale, cached because creating one is slow. */
export function currencyFormat(currency: Currency, locale: Language): Intl.NumberFormat {
  const key = `${locale}:${currency}`
  let format = formatters.get(key)
  if (!format) {
    format = new Intl.NumberFormat(locale, { style: 'currency', currency })
    formatters.set(key, format)
  }
  return format
}

/**
 * Writes an amount in a currency the way the locale does: `formatMoney('125000', 'VND', 'vi')` is
 * `125.000 ₫`. Each currency shows its own number of decimals (none for VND), rounding half away from zero.
 * The decimal string goes to `Intl` as it is, never through a JavaScript `number`, so no digit is lost.
 */
export function formatMoney(amount: DecimalString, currency: Currency, locale: Language): string {
  // The message leaves out the amount: error reports must not carry financial content.
  if (!decimalPattern.test(amount)) throw new Error('formatMoney expects a decimal string such as "125000.00".')
  return currencyFormat(currency, locale).format(amount as Intl.StringNumericLiteral)
}
