import type { UseFormRegisterReturn } from 'react-hook-form'
import { cn, focusRingWithin } from '@/shared/lib/utils'

type Props = {
  /** Read out for the group, which shows no label of its own. */
  legend: string
  options: { value: string; label: string }[]
  /** What `register` answered for the field the radios hold. */
  registration: UseFormRegisterReturn
  /** Already translated. */
  error?: string
}

/** A choice of a few values side by side, one always picked: radio buttons that look like a segmented control. */
export function ToggleField({ legend, options, registration, error }: Props) {
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              'cursor-pointer rounded-md px-3 py-1.5 text-center text-sm font-medium text-foreground/70 has-checked:bg-background has-checked:text-foreground has-checked:shadow-sm',
              focusRingWithin,
            )}
          >
            <input type="radio" value={option.value} className="sr-only" {...registration} />
            {option.label}
          </label>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </fieldset>
  )
}
