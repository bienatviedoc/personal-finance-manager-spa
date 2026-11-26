import type { Category } from '@/features/categories'
import type { Occurrence } from '../api/recurringRules'

/** What an occurrence is known by, as its rule is: who is paid; without a payee, what it is for; else its type's name. */
export function occurrenceTitle(occurrence: Occurrence, category: Category | undefined, typeName: string) {
  return occurrence.payee ?? category?.name ?? typeName
}
