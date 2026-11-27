import type { Mapping } from '../api/imports'

/** Whether a mapping says enough to read transactions: a date column, and one amount column or both a debit and a credit column. */
export function isComplete(mapping: Mapping) {
  return mapping.dateColumn !== null && (mapping.amountColumn !== null || (mapping.debitColumn !== null && mapping.creditColumn !== null))
}
