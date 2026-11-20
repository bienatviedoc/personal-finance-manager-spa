import { useId } from 'react'
import { Controller, type Control, type FieldPathByValue, type FieldValues } from 'react-hook-form'
import { Label } from '@/shared/ui/label'
import { AmountInput, type AmountValue } from './AmountInput'
import type { Currency } from './currencies'

type Props<Values extends FieldValues, Output> = {
  control: Control<Values, unknown, Output>
  /** A field of the form that holds what an amount input does (`AmountValue`). */
  name: FieldPathByValue<Values, AmountValue>
  label: string
  hint?: string
  /** Already translated. Shown under the field and announced with it. */
  error?: string
  /** Decides how many decimals the amount may have (none for VND). */
  currency: Currency
  /** Lets the amount be below zero, for a balance that can be: an overdrawn account's opening balance. */
  allowNegative?: boolean
}

/**
 * A labelled amount input for a React Hook Form field, whose hint and error are tied to it for screen
 * readers: what `TextField` is for text. The field holds a decimal string, `''` when empty, or null when the
 * text is not an amount, which the form's schema should refuse.
 */
export function AmountField<Values extends FieldValues, Output = Values>({ control, name, label, hint, error, currency, allowNegative }: Props<Values, Output>) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <AmountInput
            id={id}
            ref={field.ref}
            name={field.name}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            currency={currency}
            allowNegative={allowNegative}
            aria-invalid={error ? true : undefined}
            aria-describedby={[hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined}
          />
        )}
      />
      {hint && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
