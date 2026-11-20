import { useId } from 'react'
import { cn, focusRing } from '@/shared/lib/utils'

type Props<Value extends string> = {
  label: string
  value: Value | undefined
  options: readonly { value: Value; label: string }[]
  onChoose: (value: Value) => void
}

/** A compact select with its label beside it, for the shell's language and theme switches. */
export function LabelledSelect<Value extends string>({ label, value, options, onChoose }: Props<Value>) {
  const id = useId()

  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor={id} className="text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        className={cn('rounded-md border border-input bg-background px-2 py-1', focusRing)}
        value={value}
        onChange={(event) => onChoose(event.target.value as Value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
