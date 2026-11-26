import { useCallback, useState } from 'react'
import { bulkFilterOf, type BulkSelection } from '../api/bulk'
import { canBePicked, type FilteredTotal, type Transaction, type TransactionFilters } from '../api/transactions'

/**
 * What is selected: transactions picked one by one, as they were when picked, or every one that passes the
 * filters of a view, written as `filtersKey` writes them, loaded or not.
 */
type Selection = { rows: Transaction[] } | { allOf: string }

const filtersKey = (view: TransactionFilters) => JSON.stringify(bulkFilterOf(view))

/**
 * The transactions selected in the list of a view: picked one by one, or all that pass its filters. Picked one by one,
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
  const pickedRows = 'rows' in selection ? selection.rows : []
  // What is picked, as the list has it now where it shows it: one that has since become a leg or a refund is not.
  const picked = pickedRows.map((row) => saved.find((transaction) => transaction.id === row.id) ?? row)
  const clear = useCallback(() => setSelection({ rows: [] }), [])

  return {
    allSelected,
    pickedRows,
    picked,
    isSelected: (id: string) => allSelected || pickedRows.some((row) => row.id === id),
    toggle: (transaction: Transaction) =>
      setSelection(() => {
        // Unselecting one of all of them leaves the others loaded selected, one by one.
        const rows = allSelected ? saved : pickedRows
        return { rows: rows.some((row) => row.id === transaction.id) ? rows.filter((row) => row.id !== transaction.id) : [...rows, transaction] }
      }),
    toggleAll: () => setSelection(allSelected ? { rows: [] } : { allOf: filtersKey(view) }),
    clear,
    // Marking as a transfer is offered while what was picked could become one: one or two income or expenses.
    marking: !allSelected && pickedRows.length > 0 && pickedRows.length <= 2 && pickedRows.every(canBePicked),
    count: allSelected ? Number(total?.count ?? 0) : pickedRows.length,
    /** What is selected, as a bulk action sends it. */
    bulk: (allSelected ? { filter: bulkFilterOf(view) } : { transactionIds: pickedRows.map((row) => row.id) }) satisfies BulkSelection,
  }
}
