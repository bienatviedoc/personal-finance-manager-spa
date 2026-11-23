/**
 * For the `onEscapeKeyDown` of a drawer that holds a type-ahead picker (`ComboboxField`): Escape closes the
 * picker's open list and leaves the drawer open; only the next one closes the drawer.
 */
export function escapeClosesPickerFirst(event: KeyboardEvent) {
  const { target } = event
  if (target instanceof Element && target.getAttribute('role') === 'combobox' && target.getAttribute('aria-expanded') === 'true') event.preventDefault()
}
