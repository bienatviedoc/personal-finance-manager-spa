import { within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

/** The list a type-ahead picker (`ComboboxField`) has open. */
function listOf(combobox: HTMLElement) {
  const list = document.getElementById(combobox.getAttribute('aria-controls') ?? '')
  if (!list) throw new Error('The picker is not open.')
  return list
}

/** Opens a type-ahead picker and answers what it offers, in order. */
export async function offeredBy(user: UserEvent, combobox: HTMLElement) {
  await user.click(combobox)
  return within(listOf(combobox))
    .queryAllByRole('option')
    .map((option) => option.textContent)
}

/** Chooses an option of a type-ahead picker by its name, with the pointer. */
export async function choose(user: UserEvent, combobox: HTMLElement, name: string) {
  await user.click(combobox)
  await user.click(within(listOf(combobox)).getByRole('option', { name }))
}
