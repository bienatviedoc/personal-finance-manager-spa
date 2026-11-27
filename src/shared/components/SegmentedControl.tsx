import { useId } from 'react'
import { cn, focusRingWithin } from '@/shared/lib/utils'

type Props<Value extends string> = {
  /** Read out for the group, which shows no label of its own. */
  legend: string
  /** Already translated. */
  options: { value: Value; label: string }[]
  value: Value
  onChange: (value: Value) => void
  className?: string
}

/**
 * A choice of a few values side by side, one always picked, held by the screen rather than a form: radio buttons
 * that look like a segmented control. `ToggleField` is the same control in a form.
 */
export function SegmentedControl<Value extends string>({ legend, options, value, onChange, className }: Props<Value>) {
  // Each control's radios are a group of their own, however many are on the page.
  const name = useId()
  return (
    <fieldset className={className}>
      <legend className="sr-only">{legend}</legend>
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-muted p-1">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              'cursor-pointer rounded-md px-3 py-1 text-center text-sm font-medium text-muted-foreground has-checked:bg-background has-checked:text-foreground has-checked:shadow-sm',
              focusRingWithin,
            )}
          >
            <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} className="sr-only" />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
