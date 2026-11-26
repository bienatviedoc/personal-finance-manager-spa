import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { refreshTransactions } from '@/features/transactions'
import { api } from '@/shared/api/client'
import { refusedFields } from '@/shared/api/refusedFields'
import type { components } from '@/shared/api/schema'

/** A check of an account against one bank statement, with the difference still to reach zero (see the glossary). */
export type Reconciliation = components['schemas']['ReconciliationResponse']
/** A transaction that can be ticked against the statement, and whether it is. */
export type TransactionToTick = components['schemas']['ReconciliationTransactionResponse']
/** What starting one sends: the statement's closing date and closing balance. */
export type StatementFields = { statementDate: string; statementBalance: string }

const startFields = ['statementDate', 'statementBalance'] as const
export type StartField = (typeof startFields)[number]

/**
 * What starting answers: the reconciliation started, the fields the API refused, or that the account has one
 * in progress already (started somewhere else since the screen was loaded).
 */
export type StartOutcome = { saved: true; reconciliation: Reconciliation } | { saved: false; fields: StartField[] } | { saved: false; inProgress: true }

const reconciliationsKey = ['reconciliations']
const latestKey = (accountId: string) => [...reconciliationsKey, 'latest', accountId]

/**
 * The account's latest reconciliation, in progress or completed, or null when it has none. Only the latest can
 * be worked on: ticked, completed, cancelled or reopened.
 */
export const latestReconciliationQuery = (accountId: string) =>
  queryOptions({
    queryKey: latestKey(accountId),
    queryFn: async () => {
      const { data, response } = await api.GET('/api/v1/accounts/{accountId}/reconciliations', { params: { path: { accountId }, query: { limit: 1 } } })
      if (!data) throw new Error(`Could not load reconciliations: ${response.status}`)
      return data.items[0] ?? null
    },
  })

/** The transactions to tick against the statement, oldest first: those ticked in it and, while it is in progress, the account's others up to the statement date. */
export const transactionsToTickQuery = (id: string) =>
  queryOptions({
    queryKey: [...reconciliationsKey, id, 'transactions'],
    queryFn: async () => {
      const { data, response } = await api.GET('/api/v1/reconciliations/{id}/transactions', { params: { path: { id } } })
      if (!data) throw new Error(`Could not load the transactions to tick: ${response.status}`)
      return data.items
    },
  })

/** Starts reconciling the account against a statement. */
export function useStartReconciliation(accountId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: StatementFields): Promise<StartOutcome> => {
      const { data, error, response } = await api.POST('/api/v1/accounts/{accountId}/reconciliations', { params: { path: { accountId } }, body })
      if (data) return { saved: true, reconciliation: data }
      if (response.status === 409) return { saved: false, inProgress: true }
      const fields = refusedFields(response, error, startFields)
      if (fields) return { saved: false, fields }
      throw new Error(`Starting a reconciliation failed: ${response.status}`)
    },
    onSuccess: (outcome) => {
      if (outcome.saved) queryClient.setQueryData(latestKey(accountId), outcome.reconciliation)
      else if ('inProgress' in outcome) return queryClient.invalidateQueries({ queryKey: latestKey(accountId) })
    },
  })
}

/** Ticks a transaction the statement shows (`TickTransaction`). Ticking one already ticked changes nothing. */
export function useTickTransaction(reconciliation: Pick<Reconciliation, 'id' | 'accountId'>) {
  return useChangeTick(reconciliation, 'Ticking', (path) => api.PUT('/api/v1/reconciliations/{id}/transactions/{transactionId}', { params: { path } }))
}

/** Unticks a transaction (`UntickTransaction`). Unticking one not ticked changes nothing. */
export function useUntickTransaction(reconciliation: Pick<Reconciliation, 'id' | 'accountId'>) {
  return useChangeTick(reconciliation, 'Unticking', (path) =>
    api.DELETE('/api/v1/reconciliations/{id}/transactions/{transactionId}', { params: { path } }),
  )
}

/**
 * Ticking or unticking a transaction, taking its id. The API answers the reconciliation with its new
 * difference, which the screen shows; the list is loaded again to show the tick.
 */
function useChangeTick(
  reconciliation: Pick<Reconciliation, 'id' | 'accountId'>,
  changeName: string,
  change: (path: { id: string; transactionId: string }) => Promise<{ data?: Reconciliation; response: Response }>,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (transactionId: string) => {
      const { data, response } = await change({ id: reconciliation.id, transactionId })
      if (!data) throw new Error(`${changeName} a transaction failed: ${response.status}`)
      return data
    },
    onSuccess: (answered) => queryClient.setQueryData(latestKey(reconciliation.accountId), answered),
    // Refused or not, the list shows what the API holds.
    onSettled: () => queryClient.invalidateQueries({ queryKey: transactionsToTickQuery(reconciliation.id).queryKey }),
  })
}

/** Completes the reconciliation, which locks what is ticked in it. Only at a difference of exactly zero; nothing adjusts it. */
export function useCompleteReconciliation(reconciliation: Pick<Reconciliation, 'id' | 'accountId'>) {
  return useChangeReconciliation(reconciliation, 'Completing', async (id) => api.POST('/api/v1/reconciliations/{id}/complete', { params: { path: { id } } }))
}

/** Reopens a completed reconciliation: its transactions are unlocked and stay ticked. */
export function useReopenReconciliation(reconciliation: Pick<Reconciliation, 'id' | 'accountId'>) {
  return useChangeReconciliation(reconciliation, 'Reopening', async (id) => api.POST('/api/v1/reconciliations/{id}/reopen', { params: { path: { id } } }))
}

/** Cancels a reconciliation in progress: what is ticked in it is unticked and it is removed. */
export function useCancelReconciliation(reconciliation: Pick<Reconciliation, 'id' | 'accountId'>) {
  return useChangeReconciliation(
    reconciliation,
    'Cancelling',
    async (id) => api.DELETE('/api/v1/reconciliations/{id}', { params: { path: { id } } }),
    // Not found: cancelled already, which is what was asked for.
    (response) => response.ok || response.status === 404,
  )
}

/**
 * A change to the whole reconciliation. Whatever it answers, the account's latest reconciliation and its list
 * are loaded again, as are the transactions, which it may have locked or unlocked.
 */
function useChangeReconciliation(
  { id }: Pick<Reconciliation, 'id'>,
  changeName: string,
  change: (id: string) => Promise<{ response: Response }>,
  done: (response: Response) => boolean = (response) => response.ok,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { response } = await change(id)
      if (!done(response)) throw new Error(`${changeName} a reconciliation failed: ${response.status}`)
    },
    onSettled: () => refreshAfterChange(queryClient),
  })
}

/** Every reconciliation query, the account's latest among them, is under `reconciliationsKey`. */
function refreshAfterChange(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: reconciliationsKey }),
    refreshTransactions(queryClient),
  ])
}
