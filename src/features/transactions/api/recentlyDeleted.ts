import { infiniteQueryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { components } from '@/shared/api/schema'
import { refreshTransactions, transactionsKey } from './transactions'

/** A transaction deleted in the last 30 days, as it was when it was deleted, with when it can be restored until. */
export type DeletedTransaction = components['schemas']['DeletedTransactionResponse']

/**
 * The user's recently deleted transactions (spec section 3, rule 10): those deleted in the last 30 days, the last
 * deleted first, each leg of a deleted transfer on its own. Under the transactions' key, so deleting or restoring
 * one loads it again.
 */
export const recentlyDeletedQuery = infiniteQueryOptions({
  queryKey: [...transactionsKey, 'deleted'],
  queryFn: async ({ pageParam }) => {
    const { data, response } = await api.GET('/api/v1/transactions/deleted', { params: { query: { cursor: pageParam } } })
    if (!data) throw new Error(`Could not load recently deleted transactions: ${response.status}`)
    return data
  },
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (last) => last.nextCursor ?? undefined,
})

/**
 * Restores a transaction deleted in the last 30 days: it is back in the lists and its account's balance. Restoring a
 * leg of a transfer restores the whole transfer.
 */
export function useRestoreTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { response } = await api.POST('/api/v1/transactions/{id}/restore', { params: { path: { id } } })
      // Not found: restored already, or no longer restorable; either way the list loaded again shows which.
      if (!response.ok && response.status !== 404) throw new Error(`Restoring a transaction failed: ${response.status}`)
    },
    onSuccess: () => refreshTransactions(queryClient),
  })
}
