import { useCallback, useState } from 'react'
import { bulkFilterOf, type BulkSelection } from '../api/bulk'
import { canBePicked, type FilteredTotal, type Transaction, type TransactionFilters } from '../api/transactions'

/**
 * What is selected: transactions picked one by one, as they were when picked, or every one that passes the
 * filters of a view, written as `filtersKey` writes them, loaded or not, except the ones unselected since by id.
 */
type Selection = { rows: Transaction[] } | { allOf: string; except: string[] }

const filtersKey = (view: TransactionFilters) => JSON.stringify(bulkFilterOf(view))

/**
 * The transactions selected in the list of a view: picked one by one, or all that pass its filters but those
 * unselected since, so the count goes down by one for each and none of the others is dropped. Picked one by one,
 * they stay selected as they were where a filter now hides them, so an expense can be picked under one account's
 * filter and income under another's to mark as a transfer. All of them belong to the view they were selected in.
 *
 * @param saved The transactions of the view loaded so far that the API has, to follow what was picked as they are now.
 * @param total What the API says the view comes to: how many all of them are.
 */
export function useSelection(view: TransactionFilters, saved: Transaction[], total: FilteredTotal | undefined) {
  const [selection, setSelection] = useState<Selection>({ rows: [] })
  // Every transaction that passes the filters, while the view is still the one they were selected under.
  const allSelected = 'allOf' in selection && selection.allOf === filtersKey(view)
  const except = allSelected ? selection.except : []
  const pickedRows = 'rows' in selection ? selection.rows : []
  // What is picked, as the list has it now where it shows it: one that has since become a leg or a refund is not.
  const picked = pickedRows.map((row) => saved.find((transaction) => transaction.id === row.id) ?? row)
  const clear = useCallback(() => setSelection({ rows: [] }), [])

  return {
    allSelected,
    pickedRows,
    picked,
    isSelected: (id: string) => (allSelected ? !except.includes(id) : pickedRows.some((row) => row.id === id)),
    toggle: (transaction: Transaction) =>
      setSelection((current) => {
        if (allSelected && 'allOf' in current) {
          // Unselecting one of all of them leaves out that one only; unselecting the last clears the selection.
          const left = except.includes(transaction.id) ? except.filter((id) => id !== transaction.id) : [...except, transaction.id]
          return left.length >= Number(total?.count ?? 0) ? { rows: [] } : { ...current, except: left }
        }
        return {
          rows: pickedRows.some((row) => row.id === transaction.id) ? pickedRows.filter((row) => row.id !== transaction.id) : [...pickedRows, transaction],
        }
      }),
    toggleAll: () => setSelection(allSelected ? { rows: [] } : { allOf: filtersKey(view), except: [] }),
    clear,
    // Marking as a transfer is offered while what was picked could become one: one or two income or expenses.
    marking: !allSelected && pickedRows.length > 0 && pickedRows.length <= 2 && pickedRows.every(canBePicked),
    count: allSelected ? Math.max(Number(total?.count ?? 0) - except.length, 0) : pickedRows.length,
    /** What is selected, as a bulk action sends it. */
    bulk: (allSelected
      ? { filter: bulkFilterOf(view), ...(except.length > 0 && { exceptTransactionIds: except }) }
      : { transactionIds: pickedRows.map((row) => row.id) }) satisfies BulkSelection,
  }
}
