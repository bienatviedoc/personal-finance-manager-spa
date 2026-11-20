import { useState, type ComponentProps } from 'react'
import type { Language } from '@/shared/i18n'
import { useLocale } from '@/shared/i18n/useLocale'
import { Input } from '@/shared/ui/input'
import type { Currency, DecimalString } from './currencies'
import { formatAmountForInput, parseAmount } from './parseAmount'

/**
 * What an amount input holds: a decimal string when the text is an amount, `''` when it is empty, and
 * null when the text is not an amount in the locale (validate that as an error).
 */
export type AmountValue = DecimalString | null

type Props = Omit<ComponentProps<typeof Input>, 'value' | 'defaultValue' | 'onChange' | 'type' | 'inputMode'> & {
  value: AmountValue
  onChange: (value: AmountValue) => void
  /** Decides how many decimals the amount may have (none for VND). */
  currency: Currency
  /** Lets the amount be below zero, for a balance that can be: an overdrawn account's opening balance. */
  allowNegative?: boolean
}

/**
 * A text input for an amount of money. The user types in their locale's separators (`1.200.000,5` in
 * Vietnamese); the value it reports is a decimal string (`"1200000.5"`), never a JavaScript number. On blur a
 * valid amount is rewritten in the locale's format. Works as a controlled input with React Hook Form's
 * `Controller`; label it with a `<Label htmlFor>` or wrap it like `TextField`.
 */
export function AmountInput({ value, onChange, currency, allowNegative = false, onBlur, ...input }: Props) {
  const locale = useLocale()
  const [text, setText] = useState(() => textFor(value, locale, currency))
  // The value and locale the text was last written or read for.
  const [synced, setSynced] = useState({ value, locale })

  // A value set from outside (a form reset, a different record) or a change of locale rewrites the text.
  if (synced.value !== value || synced.locale !== locale) {
    setSynced({ value, locale })
    // Text that is not an amount is left for the user to fix; text they are typing already reads as the value.
    const keepsText = value === null || (synced.locale === locale && read(text, locale, currency, allowNegative) === value)
    if (!keepsText) setText(textFor(value, locale, currency))
  }

  return (
    <Input
      {...input}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onChange={(event) => {
        const next = event.target.value
        const parsed = read(next, locale, currency, allowNegative)
        setText(next)
        setSynced({ value: parsed, locale })
        onChange(parsed)
      }}
      onBlur={(event) => {
        if (value) setText(textFor(value, locale, currency))
        onBlur?.(event)
      }}
    />
  )
}

function read(text: string, locale: Language, currency: Currency, allowNegative: boolean): AmountValue {
  return text.trim() === '' ? '' : parseAmount(text, locale, currency, { allowNegative })
}

function textFor(value: AmountValue, locale: Language, currency: Currency): string {
  return value ? formatAmountForInput(value, locale, currency) : ''
}
