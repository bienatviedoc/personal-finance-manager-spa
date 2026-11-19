import { useState, type ComponentProps } from 'react'
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
}

/**
 * A text input for an amount of money. The user types in their locale's separators (`1.200.000,5` in
 * Vietnamese); the value it reports is a decimal string (`"1200000.5"`), never a JavaScript number. On blur a
 * valid amount is rewritten in the locale's format. Works as a controlled input with React Hook Form's
 * `Controller`; label it with a `<Label htmlFor>` or wrap it like `TextField`.
 */
export function AmountInput({ value, onChange, currency, onBlur, ...input }: Props) {
  const locale = useLocale()
  const [text, setText] = useState(() => textFor(value, locale))
  const [shown, setShown] = useState({ value, locale })

  // A value set from outside (a form reset, a different record) or a change of locale rewrites the text.
  if (shown.value !== value || shown.locale !== locale) {
    setShown({ value, locale })
    // Text that is not an amount is left for the user to fix; text they are typing already reads as the value.
    const keepsText = value === null || (shown.locale === locale && read(text, locale, currency) === value)
    if (!keepsText) setText(textFor(value, locale))
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
        const parsed = read(next, locale, currency)
        setText(next)
        setShown({ value: parsed, locale })
        onChange(parsed)
      }}
      onBlur={(event) => {
        if (value) setText(textFor(value, locale))
        onBlur?.(event)
      }}
    />
  )
}

function read(text: string, locale: Parameters<typeof parseAmount>[1], currency: Currency): AmountValue {
  return text.trim() === '' ? '' : parseAmount(text, locale, currency)
}

function textFor(value: AmountValue, locale: Parameters<typeof formatAmountForInput>[1]): string {
  return value ? formatAmountForInput(value, locale) : ''
}
