import { X } from 'lucide-react'
import { useId, useState, type KeyboardEvent, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/utils'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { tagName } from '../api/tags'

type Props = {
  /** The names of the tags chosen, in the order they were added. */
  value: string[]
  onChange: (tags: string[]) => void
  onBlur?: () => void
  /** The user's tags, suggested as a tag is typed. */
  suggestions: string[]
  /** The input, for a form to focus when the field is at fault. */
  ref?: Ref<HTMLInputElement>
  /** Already translated. Shown under the field and announced with it. */
  error?: string
}

// Named outside JSX, where lint would take an ARIA value for user-facing text.
const narrowsItsList = 'list'

/**
 * The tags of a transaction (spec TXN-5): each a chip that can be removed, and an input that adds one. Typing
 * suggests the user's tags whose name contains what was typed; the arrow keys move through them, and Enter or a
 * click adds one. Enter or a comma adds what was typed, which creates a tag the user has none of yet; so does
 * leaving the field with something typed. Backspace in the empty input takes the last tag off. With nothing
 * typed, Enter is the form's.
 */
export function TagsField({ value, onChange, onBlur, suggestions, ref, error }: Props) {
  const { t } = useTranslation()
  const id = useId()
  const listId = `${id}-list`
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const [typed, setTyped] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const search = tagName(typed)
  const matches = open ? suggestions.filter((name) => !value.includes(name) && name.includes(search)) : []
  const highlighted = matches[Math.min(active, matches.length - 1)]

  const add = (text: string) => {
    const name = tagName(text)
    if (name && !value.includes(name)) onChange([...value, name])
    setTyped('')
    setOpen(false)
  }
  const remove = (name: string) => onChange(value.filter((tag) => tag !== name))

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        setActive(0)
      } else if (matches.length > 0) {
        setActive((Math.min(active, matches.length - 1) + (event.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length)
      }
    } else if ((event.key === 'Enter' || event.key === ',') && (search || (open && highlighted))) {
      // Adds; with nothing typed, the next Enter saves the form.
      event.preventDefault()
      add(event.key === 'Enter' && highlighted ? highlighted : typed)
    } else if (event.key === 'Backspace' && typed === '' && value.length > 0) {
      remove(value.at(-1)!)
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div className="relative space-y-1.5">
      <Label htmlFor={id}>{t('transactions.tags.label')}</Label>
      {value.length > 0 && (
        <ul aria-label={t('transactions.tags.chosen')} className="flex flex-wrap gap-1">
          {value.map((name) => (
            <li key={name} className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 text-sm">
              <span data-testid="tag">{name}</span>
              <button type="button" className="rounded-full" aria-label={t('transactions.tags.remove', { name })} onClick={() => remove(name)}>
                <X aria-hidden className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        id={id}
        ref={ref}
        role="combobox"
        aria-expanded={matches.length > 0}
        aria-controls={listId}
        aria-autocomplete={narrowsItsList}
        aria-activedescendant={highlighted ? `${listId}-${highlighted}` : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, error && errorId].filter(Boolean).join(' ')}
        autoComplete="off"
        value={typed}
        onChange={(event) => {
          setTyped(event.target.value)
          setOpen(event.target.value.trim() !== '')
          setActive(0)
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          // What was typed is not lost by moving on, to Save say.
          if (search) add(typed)
          else setOpen(false)
          onBlur?.()
        }}
      />
      {matches.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {matches.map((name) => (
            <li
              key={name}
              id={`${listId}-${name}`}
              role="option"
              aria-selected={name === highlighted}
              className={cn('cursor-pointer rounded-md px-2 py-1.5 text-sm', name === highlighted && 'bg-accent text-accent-foreground')}
              // On the press, not the click after it: the input keeps the focus, so adding with the pointer is not first a leaving of the field.
              onMouseDown={(event) => {
                event.preventDefault()
                add(name)
              }}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
      <p id={hintId} className="text-sm text-muted-foreground">
        {t('transactions.tags.hint')}
      </p>
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
