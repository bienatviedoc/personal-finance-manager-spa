import { useId, type ComponentProps } from 'react'
import { Label } from '@/shared/ui/label'
import { cn, focusRing } from '@/shared/lib/utils'

type Option = { value: string; label: string }

type Props = Omit<ComponentProps<'select'>, 'children'> & {
  label: string
  options: Option[]
  hint?: string
  /** Already translated. Shown under the field and announced with it. */
  error?: string
}

/** A labelled native select whose hint and error are tied to it for screen readers. */
export function SelectField({ label, options, hint, error, id, className, ...select }: Props) {
  const generatedId = useId()
  const selectId = id ?? generatedId
  const hintId = `${selectId}-hint`
  const errorId = `${selectId}-error`
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className="space-y-1.5">
      <Label htmlFor={selectId}>{label}</Label>
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn('h-8 w-full rounded-lg border border-input bg-background px-2.5 text-base md:text-sm', focusRing, className)}
        {...select}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
