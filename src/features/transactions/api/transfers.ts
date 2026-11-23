import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { components } from '@/shared/api/schema'
import { ifMatch, versionedSaveOutcome, type VersionedSaveOutcome } from '@/shared/api/versionedSave'
import { refreshTransactions, transactionsKey } from './transactions'

/** A transfer: its two legs, a Transfer out on the source account and a Transfer in on the destination, as one movement. */
export type Transfer = components['schemas']['TransferResponse']
/** What recording or editing one sends. `toAmount` is sent only between accounts in different currencies. */
export type TransferFields = components['schemas']['TransferRequest']

/** Fields the API can refuse, which the form shows its own translated message for. */
const transferFields = ['fromAccountId', 'toAccountId', 'amount', 'toAmount', 'date', 'note'] as const
export type TransferField = (typeof transferFields)[number]

export type TransferSaveOutcome = VersionedSaveOutcome<'transfer', Transfer, TransferField>

/**
 * One transfer, by the `transferId` each of its legs carries in the transaction list. Kept under the
 * transactions' key, so whatever changes a transaction or a transfer loads it again. Null once it is deleted.
 */
export const transferQuery = (id: string) =>
  queryOptions({
    queryKey: [...transactionsKey, 'transfer', id],
    queryFn: async () => {
      const { data, response } = await api.GET('/api/v1/transfers/{id}', { params: { path: { id } } })
      if (response.status === 404) return null
      if (!data) throw new Error(`Could not load the transfer: ${response.status}`)
      return data
    },
  })

/**
 * Records a transfer: both legs, together. The idempotency key is made up by the caller, once per transfer it
 * means to record: sending the same one again after a failure cannot record it twice. Not optimistic: the
 * list shows the two legs once the API has answered.
 */
export function useCreateTransfer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ fields, idempotencyKey }: { fields: TransferFields; idempotencyKey: string }): Promise<TransferSaveOutcome> =>
      versionedSaveOutcome(
        'transfer',
        await api.POST('/api/v1/transfers', { params: { header: { 'Idempotency-Key': idempotencyKey } }, body: fields }),
        transferFields,
      ),
    // A request that failed may still have been saved.
    onSettled: () => refreshTransactions(queryClient),
  })
}

/**
 * Edits the transfer, both legs together, from the row version it was read at, sent as `If-Match`. If the
 * transfer has changed since (a 412) nothing is saved and the outcome is stale.
 */
export function useEditTransfer({ id, rowVersion }: Pick<Transfer, 'id' | 'rowVersion'>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (fields: TransferFields): Promise<TransferSaveOutcome> =>
      versionedSaveOutcome(
        'transfer',
        await api.PUT('/api/v1/transfers/{id}', { params: { path: { id }, header: { 'If-Match': ifMatch(rowVersion) } }, body: fields }),
        transferFields,
      ),
    onSettled: () => refreshTransactions(queryClient),
  })
}

/** Deletes the transfer: both legs leave the list, and both accounts' balances follow. */
export function useDeleteTransfer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { response } = await api.DELETE('/api/v1/transfers/{id}', { params: { path: { id } } })
      // Not found: deleted already, which is what was asked for.
      if (!response.ok && response.status !== 404) throw new Error(`Deleting a transfer failed: ${response.status}`)
    },
    onSuccess: () => refreshTransactions(queryClient),
  })
}
