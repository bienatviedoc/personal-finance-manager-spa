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
 */
export function parseAmount(text: string, locale: Language, currency: Currency): DecimalString | null {
  const { group, decimal } = separators(locale)
  const g = escape(group)
  const d = escape(decimal)
  const match = new RegExp(`^(\\d{1,3}(?:${g}\\d{3})+|\\d+)(?:${d}(\\d+))?$`).exec(text.trim())
  if (!match) return null

  const integer = match[1]!.replaceAll(group, '').replace(/^0+(?=\d)/, '')
  const fraction = match[2]
  if (integer.length > maxIntegerDigits) return null
  if (fraction && fraction.length > currencyFormat(currency, locale).resolvedOptions().maximumFractionDigits!) return null

  return fraction ? `${integer}.${fraction}` : integer
}

/**
 * Writes a decimal string the way the locale writes numbers, with every decimal it has and no currency
 * symbol: what an amount input shows. `parseAmount` reads it back to the same decimal string.
 */
export function formatAmountForInput(amount: DecimalString, locale: Language): string {
  const decimals = amount.split('.')[1]?.length ?? 0
  return new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(
    amount as Intl.StringNumericLiteral,
  )
}
