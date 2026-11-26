import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { components } from '@/shared/api/schema'
import { refreshTransactions, type TransactionFilters } from './transactions'

/** One action on many transactions: what it does, and the category, tag or account it names. */
export type BulkAction =
  | { action: 'setCategory'; categoryId: string }
  | { action: 'addTag' | 'removeTag'; tag: string }
  | { action: 'moveToAccount'; accountId: string }
  | { action: 'delete' }

/**
 * Which transactions a bulk action acts on: the ones picked one by one, or every one that passes the list's
 * filters, which the API finds itself, loaded on the screen or not.
 */
export type BulkSelection = { transactionIds: string[] } | { filter: BulkFilter }

/** The list's filters, without its sort order: what selects every transaction that passes them. */
export type BulkFilter = Omit<TransactionFilters, 'sort' | 'order'>

/** A transaction the action was refused on, and why (`reason`); the API's `message` is English, so screens say their own. */
export type RefusedTransaction = components['schemas']['RefusedTransactionResponse']
export type BulkRefusal = components['schemas']['BulkRefusal']

/**
 * What a bulk action came to: done to every one selected, refused on some (`refused`, and then nothing changed),
 * or refused as a whole on what it names (`invalid`: a category or account that can no longer be chosen).
 */
export type BulkOutcome = { done: true; count: number } | { done: false; refused: RefusedTransaction[] } | { done: false; invalid: true }

/**
 * Acts on many transactions at once (spec TXN-7): all of them take it or none does. Done, it loads again
 * everything a change to a transaction shows in: the lists, the balances, the budgets and the reports.
 */
export function useBulkEdit() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (request: BulkAction & BulkSelection): Promise<BulkOutcome> => {
      const { data, error, response } = await api.POST('/api/v1/transactions/bulk', { body: request })
      if (data) return { done: true, count: Number(data.count) }
      if (response.status === 409 && error && 'refused' in error) return { done: false, refused: error.refused }
      if (response.status === 400) return { done: false, invalid: true }
      throw new Error(`A bulk action failed: ${response.status}`)
    },
    onSuccess: (outcome) => outcome.done && refreshTransactions(queryClient),
    // A request that failed may still have been done.
    onError: () => refreshTransactions(queryClient),
  })
}
