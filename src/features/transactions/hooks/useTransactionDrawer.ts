import { useCallback, useState } from 'react'
import { isPending, isTransferLeg, type ListedTransaction, type Transaction } from '../api/transactions'

/**
 * What the drawer is open for: editing this transaction, as it was when the drawer opened, recording a
 * transfer, or editing the transfer with this id, which either of its legs opens.
 */
export type DrawerFor = { editing: Transaction } | { transferring: true } | { transferId: string } | null

/**
 * The side drawer a list of transactions edits in (spec section 12): what it is open for, and the transaction
 * being edited, read from the list (`items`) to follow a newer version loaded while the drawer is open. An edit
 * shown ahead of the API's answer can move it past the pages loaded so far (an earlier date): the drawer then
 * keeps the one it was opened for, so the form and what its save answers are not lost.
 */
export function useTransactionDrawer(items: ListedTransaction[] | undefined) {
  const [openFor, setOpenFor] = useState<DrawerFor>(null)
  const editing =
    openFor && 'editing' in openFor
      ? (items?.find((transaction): transaction is Transaction => !isPending(transaction) && transaction.id === openFor.editing.id) ?? openFor.editing)
      : undefined
  /** Opens a row: a leg of a transfer opens its transfer, anything else the transaction. */
  const edit = useCallback((chosen: Transaction) => setOpenFor(isTransferLeg(chosen) ? { transferId: chosen.transferId } : { editing: chosen }), [])
  const close = useCallback(() => setOpenFor(null), [])
  return { openFor, editing, edit, open: setOpenFor, close }
}
