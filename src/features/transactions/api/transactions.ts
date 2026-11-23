import { infiniteQueryOptions, queryOptions, useMutation, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query'
import { refreshAccountBalances } from '@/features/accounts'
import { api } from '@/shared/api/client'
import type { components } from '@/shared/api/schema'
import { ifMatch, isStale, versionedSaveOutcome, type VersionedSaveOutcome, type VersionedSaveResponse } from '@/shared/api/versionedSave'
import type { Currency } from '@/shared/money'

export type Transaction = components['schemas']['TransactionResponse']
export type TransactionType = components['schemas']['TransactionType']
/** What recording or editing one sends. The API takes the type as text, to name it when refusing it; the SPA only ever sends one it knows. */
export type TransactionFields = Omit<components['schemas']['TransactionRequest'], 'type'> & { type: TransactionType }
type TransactionPage = Omit<components['schemas']['TransactionListResponse'], 'items'> & { items: ListedTransaction[] }

/** Both types, in the order the toggle shows them. A type the API adds and this list lacks fails typecheck. */
export const transactionTypes = ['expense', 'income'] as const satisfies readonly TransactionType[]

type MissingType = Exclude<TransactionType, (typeof transactionTypes)[number]>
export const everyTransactionTypeListed: MissingType extends never ? true : MissingType = true

/** Fields the API can refuse, which the form shows its own translated message for. */
const transactionFields = ['type', 'accountId', 'amount', 'date', 'categoryId', 'payee', 'note', 'isRefund'] as const
export type TransactionField = (typeof transactionFields)[number]

export type SaveOutcome = VersionedSaveOutcome<'transaction', Transaction, TransactionField>

/**
 * What a form hands over to be saved: the fields, and the currency of the account they name, which the
 * transaction takes and the list shows before the API has answered.
 */
export type TransactionDraft = { fields: TransactionFields; currency: Currency }

const transactionsKey = ['transactions']

/**
 * A transaction shown before the API has answered: the API has given it no id or row version yet, so there is
 * nothing to edit or delete. It is known by the idempotency key it was sent with.
 */
export type PendingTransaction = Omit<Transaction, 'id' | 'rowVersion'> & { pendingKey: string }
/** What the list shows: the API's transactions, and any still on their way to it. */
export type ListedTransaction = Transaction | PendingTransaction
export const isPending = (transaction: ListedTransaction): transaction is PendingTransaction => 'pendingKey' in transaction
/** What tells one listed transaction from another: its id, or its key while it has none. */
export const listKey = (transaction: ListedTransaction) => (isPending(transaction) ? transaction.pendingKey : transaction.id)

/**
 * The user's transactions, newest date first and, within a date, last recorded first. A user has
 * thousands, so they are loaded a page at a time as the list asks for more.
 */
export const transactionsQuery = infiniteQueryOptions({
  queryKey: [...transactionsKey, 'list'],
  queryFn: async ({ pageParam }) => {
    const { data, response } = await api.GET('/api/v1/transactions', { params: { query: { cursor: pageParam } } })
    if (!data) throw new Error(`Could not load transactions: ${response.status}`)
    return data satisfies TransactionPage as TransactionPage
  },
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (last) => last.nextCursor ?? undefined,
})

/** What quick add asks the API. Under the transactions' key, so recording, editing or deleting one asks again. */
const quickAddKey = [...transactionsKey, 'quick-add']

async function quickAdd(query: { type?: TransactionType; payee?: string } = {}) {
  const { data, response } = await api.GET('/api/v1/transactions/quick-add', { params: { query } })
  if (!data) throw new Error(`Could not load quick add: ${response.status}`)
  return data
}

/** The account, not archived, the user recorded a transaction on last; null when they have recorded none. */
export const lastAccountQuery = queryOptions({
  queryKey: [...quickAddKey, 'last-account'],
  queryFn: async () => (await quickAdd()).lastAccountId,
})

/**
 * The category the user most often gave this payee on transactions of this type; null when they never used
 * the payee. Asks nothing while there is no payee.
 */
export const suggestedCategoryQuery = ({ type, payee }: { type: TransactionType; payee: string }) =>
  queryOptions({
    queryKey: [...quickAddKey, 'suggested-category', { type, payee: payee.trim().toLowerCase() }],
    queryFn: async () => (await quickAdd({ type, payee: payee.trim() })).suggestedCategoryId,
    enabled: payee.trim() !== '',
  })

/**
 * Records a transaction, shown in the list at once. The idempotency key is made up by the caller, once per
 * transaction it means to record: sending the same one again after a failure cannot record it twice.
 */
export function useCreateTransaction() {
  return useSaveTransaction(
    async ({ fields, idempotencyKey }: TransactionDraft & { idempotencyKey: string }) =>
      api.POST('/api/v1/transactions', { params: { header: { 'Idempotency-Key': idempotencyKey } }, body: fields }),
    ({ idempotencyKey }) => ({ pendingKey: idempotencyKey }),
  )
}

/**
 * Edits the transaction from the row version it was read at, sent as `If-Match`; the list shows the change at
 * once. If the transaction has changed since (a 412) nothing is saved and the outcome is stale.
 */
export function useEditTransaction({ id, rowVersion }: Pick<Transaction, 'id' | 'rowVersion'>) {
  return useSaveTransaction(
    async ({ fields }: TransactionDraft) =>
      api.PUT('/api/v1/transactions/{id}', { params: { path: { id }, header: { 'If-Match': ifMatch(rowVersion) } }, body: fields }),
    () => ({ id, rowVersion }),
  )
}

/** Deletes the transaction: it leaves the list and its account's balance. */
export function useDeleteTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { response } = await api.DELETE('/api/v1/transactions/{id}', { params: { path: { id } } })
      // Not found: deleted already, which is what was asked for.
      if (!response.ok && response.status !== 404) throw new Error(`Deleting a transaction failed: ${response.status}`)
    },
    onSuccess: () => refresh(queryClient),
  })
}

/** The pages of the list loaded so far. */
type LoadedPages = InfiniteData<TransactionPage, string | undefined>

/**
 * Saves a transaction optimistically (spec section 12): the lists show it as soon as it is sent, are put
 * back if it is not saved, and are loaded again, with the account balances, once the API has answered.
 */
function useSaveTransaction<Draft extends TransactionDraft>(
  save: (draft: Draft) => Promise<VersionedSaveResponse<Transaction>>,
  /** What the transaction is known by while it is shown ahead of the API's answer. */
  identify: (draft: Draft) => Pick<Transaction, 'id' | 'rowVersion'> | Pick<PendingTransaction, 'pendingKey'>,
) {
  const queryClient = useQueryClient()
  const list = { queryKey: transactionsQuery.queryKey }

  return useMutation({
    mutationFn: async (draft: Draft): Promise<SaveOutcome> => versionedSaveOutcome('transaction', await save(draft), transactionFields),
    onMutate: async (draft) => {
      // A list still loading would otherwise overwrite the optimistic one when it lands.
      await queryClient.cancelQueries(list)
      const before = queryClient.getQueryData<LoadedPages>(list.queryKey)
      const { fields, currency } = draft
      const shown: ListedTransaction = {
        ...identify(draft),
        ...fields,
        currency,
        payee: fields.payee?.trim() || null,
        note: fields.note?.trim() || null,
      }
      queryClient.setQueryData<LoadedPages>(list.queryKey, (data) => data && withTransaction(data, shown))
      return { before }
    },
    onError: (_error, _draft, context) => {
      queryClient.setQueryData(list.queryKey, context?.before)
      // A request that failed may still have been saved.
      return refresh(queryClient)
    },
    onSuccess: (outcome, _draft, context) => {
      // Refused by the API: nothing changed there, so the lists go back to what they showed.
      if (!outcome.saved && !isStale(outcome)) {
        queryClient.setQueryData(list.queryKey, context.before)
        return
      }
      // Saved, or stale: either way the lists and balances no longer show what the API holds.
      return refresh(queryClient)
    },
  })
}

function refresh(queryClient: QueryClient) {
  return Promise.all([queryClient.invalidateQueries({ queryKey: transactionsKey }), refreshAccountBalances(queryClient)])
}

/** Newest date first; within a date, the last recorded first: ids are in the order of recording, and a pending one is the latest. */
function comesBefore(a: ListedTransaction, b: ListedTransaction) {
  if (a.date !== b.date) return a.date > b.date
  if (isPending(a) || isPending(b)) return isPending(a)
  return a.id > b.id
}

/**
 * The loaded pages with the transaction put where the list's order has it, in place of the one with its id if
 * there is one. A transaction that belongs after the pages loaded so far is left out, until those are loaded.
 */
function withTransaction(data: LoadedPages, transaction: ListedTransaction): LoadedPages {
  const pages = data.pages.map((page) => ({ ...page, items: page.items.filter((item) => listKey(item) !== listKey(transaction)) }))
  for (const page of pages) {
    const index = page.items.findIndex((item) => comesBefore(transaction, item))
    const isLast = page === pages.at(-1)
    if (index !== -1) {
      page.items = page.items.toSpliced(index, 0, transaction)
      break
    }
    if (isLast && !page.nextCursor) page.items = [...page.items, transaction]
  }
  return { ...data, pages }
}
