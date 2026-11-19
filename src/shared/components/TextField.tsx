import { useId, type ComponentProps } from 'react'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'

type Props = ComponentProps<typeof Input> & {
  label: string
  hint?: string
  /** Already translated. Shown under the field and announced with it. */
  error?: string
}

/** A labelled input whose hint and error are tied to it for screen readers. */
export function TextField({ label, hint, error, id, ...input }: Props) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <Input id={inputId} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...input} />
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
