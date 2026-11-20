import { z } from 'zod'
import type { Language } from '@/shared/i18n'
import type { Currency } from './currencies'
import { formatAmountForInput } from './parseAmount'

/**
 * A form field for what an `AmountField` holds: a decimal string, `''` when empty, or null when the text is
 * not an amount, which is refused with `invalid`, the translation key of the form's own message. Empty is
 * let through, for an amount that may be left out; `requiredAmount` refuses it too.
 */
export const typedAmount = (invalid: string) =>
  z
    .string({ error: invalid })
    .nullable()
    .refine((amount) => amount !== null, { error: invalid })

/** A `typedAmount` that must be filled in: `required` is the translation key of the message for an empty one. */
export const requiredAmount = ({ invalid, required }: { invalid: string; required: string }) =>
  typedAmount(invalid).refine((amount) => amount !== '', { error: required })

/** An amount large enough to show the locale's separators, written its way: the example in an amount's error message. */
export const amountExample = (locale: Language, currency: Currency) => formatAmountForInput('1250000', locale, currency)
