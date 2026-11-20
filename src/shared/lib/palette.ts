import type { ParseKeys } from 'i18next'

export type PaletteColor = { value: string; label: ParseKeys }

/** A colour that says nothing in particular: how something looks until the user picks a colour. */
export const neutralColor = '#64748b'

/**
 * The colours offered wherever a user picks one for something they name: institutions and categories. Each is a
 * lower-case #rrggbb, the form the API's Color keeps, and every colour of the default categories is among them.
 */
export const palette: PaletteColor[] = [
  { value: '#ef4444', label: 'colors.red' },
  { value: '#f97316', label: 'colors.orange' },
  { value: '#eab308', label: 'colors.amber' },
  { value: '#84cc16', label: 'colors.lime' },
  { value: '#22c55e', label: 'colors.green' },
  { value: '#10b981', label: 'colors.emerald' },
  { value: '#14b8a6', label: 'colors.teal' },
  { value: '#0ea5e9', label: 'colors.sky' },
  { value: '#3b82f6', label: 'colors.blue' },
  { value: '#6366f1', label: 'colors.indigo' },
  { value: '#8b5cf6', label: 'colors.violet' },
  { value: '#a855f7', label: 'colors.purple' },
  { value: '#d946ef', label: 'colors.fuchsia' },
  { value: '#ec4899', label: 'colors.pink' },
  { value: '#f43f5e', label: 'colors.rose' },
  { value: neutralColor, label: 'colors.slate' },
]

/** The palette, plus the colour already chosen when it is not one of them (set elsewhere, or by an older version). */
export function paletteWith(current: string | null | undefined): PaletteColor[] {
  return !current || palette.some((color) => color.value === current) ? palette : [...palette, { value: current, label: 'colors.current' }]
}
