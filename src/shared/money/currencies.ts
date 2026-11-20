import type { components } from '@/shared/api/schema'

/** A currency the app supports, by its ISO 4217 code. The list comes from the API (`Pfm.Domain.Currency`). */
export type Currency = components['schemas']['Currency']

/**
 * An amount of money as the API sends it: a decimal string such as `"125000.00"`, always next to a
 * currency. Never turn it into a JavaScript `number`; format it with `formatMoney` or `<Money>`.
 */
export type DecimalString = string

/** Every supported currency, for pickers. A currency the API adds and this list lacks fails typecheck. */
export const currencies = ['VND', 'USD', 'EUR'] as const satisfies readonly Currency[]

type Missing = Exclude<Currency, (typeof currencies)[number]>
// Fails to compile while `currencies` lacks a currency the API supports.
export const everyCurrencyListed: Missing extends never ? true : Missing = true

/** A decimal string, optionally negative: digits, and a point followed by more digits if there is a fraction. */
export const decimalPattern = /^-?\d+(\.\d+)?$/

/** Whether an amount is zero, read from its digits: an amount is never turned into a number, even to compare. */
export function isZeroAmount(amount: DecimalString): boolean {
  return /^-?0+(\.0+)?$/.test(amount)
}
