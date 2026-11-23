import { useEffect, useId, useRef, useState, type KeyboardEvent, type Ref } from 'react'
import { cn } from '@/shared/lib/utils'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'

type Option = { value: string; label: string }

type Props = {
  label: string
  options: Option[]
  /** The value of the chosen option; '' when none is. */
  value: string
  /** Called with the value of the option the user chose, or '' when they emptied the field. */
  onChange: (value: string) => void
  onBlur?: () => void
  /** The input, for a form to focus when the field is at fault. */
  ref?: Ref<HTMLInputElement>
  placeholder?: string
  /** Already translated. Shown in place of the options when what was typed matches none. */
  noMatches: string
  hint?: string
  /** Already translated. Shown under the field and announced with it. */
  error?: string
}

// Named outside JSX, where lint would take an ARIA value for user-facing text.
const narrowsItsList = 'list'

/** Text as typing is matched against it: without case or accents, so "an uong" finds "Ăn uống". */
const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()

/**
 * A labelled type-ahead picker: typing narrows the options to those containing what was typed, the arrow keys
 * move through them, and Enter, a click or leaving the field chooses. With its list closed, Enter is the form's.
 * Follows the ARIA combobox pattern, so it is announced as one.
 */
export function ComboboxField({ label, options, value, onChange, onBlur, ref, placeholder, noMatches, hint, error }: Props) {
  const id = useId()
  const listId = `${id}-list`
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  // What the user has typed since they last chose; null while the field shows the chosen option.
  const [typed, setTyped] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const list = useRef<HTMLUListElement>(null)

  const chosen = options.find((option) => option.value === value)
  const matches = typed ? options.filter((option) => plain(option.label).includes(plain(typed.trim()))) : options
  const highlighted = open ? matches[Math.min(active, matches.length - 1)] : undefined
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined

  useEffect(() => {
    // Not there in every environment the tests run in.
    if (open) list.current?.querySelector('[data-active]')?.scrollIntoView?.({ block: 'nearest' })
  }, [open, active])

  const close = () => {
    setOpen(false)
    setTyped(null)
  }
  const choose = (option: Option) => {
    onChange(option.value)
    close()
  }
  const show = () => {
    setOpen(true)
    // Starts at the chosen option, so the arrows move on from it.
    setActive(Math.max(0, typed ? 0 : options.findIndex((option) => option.value === value)))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) show()
      else if (matches.length > 0) setActive((Math.min(active, matches.length - 1) + (event.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length)
    } else if (event.key === 'Enter' && open) {
      // Chooses; the next Enter saves the form.
      event.preventDefault()
      if (highlighted) choose(highlighted)
      else close()
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      close()
    }
  }

  return (
    <div className="relative space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        ref={ref}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete={narrowsItsList}
        aria-activedescendant={highlighted ? `${listId}-${highlighted.value}` : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        placeholder={placeholder}
        value={typed ?? chosen?.label ?? ''}
        onChange={(event) => {
          setTyped(event.target.value)
          setOpen(true)
          setActive(0)
          if (event.target.value === '' && value !== '') onChange('')
        }}
        onClick={() => !open && show()}
        onKeyDown={onKeyDown}
        onBlur={() => {
          // Leaving with something typed takes its first match, as Enter would; with no match, what was chosen stays.
          if (open && typed && highlighted) choose(highlighted)
          else close()
          onBlur?.()
        }}
      />
      {open && (
        <ul
          ref={list}
          id={listId}
          // Not named after the field: the input that controls it is what the label finds.
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {matches.map((option) => (
            <li
              key={option.value}
              id={`${listId}-${option.value}`}
              role="option"
              aria-selected={option === highlighted}
              data-active={option === highlighted || undefined}
              className={cn('cursor-pointer rounded-md px-2 py-1.5 text-sm', option === highlighted && 'bg-accent text-accent-foreground')}
              // On the press, not the click after it: the input keeps the focus, so choosing with the pointer is
              // not first a leaving of the field. The keyboard chooses from the input.
              onMouseDown={(event) => {
                event.preventDefault()
                choose(option)
              }}
            >
              {option.label}
            </li>
          ))}
          {matches.length === 0 && (
            <li role="presentation" className="px-2 py-1.5 text-sm text-muted-foreground">
              {noMatches}
            </li>
          )}
        </ul>
      )}
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
