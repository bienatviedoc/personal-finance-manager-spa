import { useId, useState, type FormEvent } from 'react'
import type { AmountValue, DecimalString } from '@/shared/money'

/**
 * The amount a budget's form holds, as the user has it: it follows the saved budget whenever that changes (saved,
 * removed, or loaded again after it was changed somewhere else). Saving an emptied amount removes the budget.
 * `submit` answers what went wrong with a save the API refused, or null; a save that failed outright says so itself.
 */
export function useBudgetAmount<Error extends string>({
  saved,
  submit,
  remove,
}: {
  saved: DecimalString | undefined
  submit: (amount: DecimalString) => Promise<Error | 'invalid' | null>
  remove: () => void
}) {
  const formId = useId()
  const errorId = useId()
  const savedValue = saved ?? ''
  const [value, setValue] = useState<AmountValue>(savedValue)
  const [syncedWith, setSyncedWith] = useState(savedValue)
  const [error, setError] = useState<Error | 'invalid' | null>(null)
  if (syncedWith !== savedValue) {
    setSyncedWith(savedValue)
    setValue(savedValue)
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (value === null) return setError('invalid')
    setError(null)
    if (value === '') {
      if (saved !== undefined) remove()
      return
    }
    setError(await submit(value))
  }

  const change = (next: AmountValue) => {
    setValue(next)
    setError(null)
  }

  return { formId, errorId, value, change, error, isDirty: value !== savedValue, hasBudget: saved !== undefined, save, remove }
}
