import { infiniteQueryOptions, useMutation, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query'
import { refreshAccountBalances } from '@/features/accounts'
import { api } from '@/shared/api/client'
import { refusedFields } from '@/shared/api/refusedFields'
import type { components } from '@/shared/api/schema'
import type { Currency } from '@/shared/money'

export type Transaction = components['schemas']['TransactionResponse']
export type TransactionType = components['schemas']['TransactionType']
/** What recording or editing one sends. The API takes the type as text, to name it when refusing it; the SPA only ever sends one it knows. */
export type TransactionFields = Omit<components['schemas']['TransactionRequest'], 'type'> & { type: TransactionType }
type TransactionPage = components['schemas']['TransactionListResponse']

/** Both types, in the order the toggle shows them. A type the API adds and this list lacks fails typecheck. */
export const transactionTypes = ['expense', 'income'] as const satisfies readonly TransactionType[]

type MissingType = Exclude<TransactionType, (typeof transactionTypes)[number]>
export const everyTransactionTypeListed: MissingType extends never ? true : MissingType = true

/** Fields the API can refuse, which the form shows its own translated message for. */
export type TransactionField = 'type' | 'accountId' | 'amount' | 'date' | 'categoryId' | 'payee' | 'note'

export type SaveOutcome =
  | { saved: true; transaction: Transaction }
  | { saved: false; fields: TransactionField[] }
  /** The transaction changed since the row version the edit was made from: nothing was saved, and the list is loaded again. */
  | { saved: false; stale: true }

/**
 * What a form hands over to be saved: the fields, and the currency of the account they name, which the
 * transaction takes and the list shows before the API has answered.
 */
export type TransactionDraft = { fields: TransactionFields; currency: Currency }

const transactionsKey = ['transactions']
const transactionFields: TransactionField[] = ['type', 'accountId', 'amount', 'date', 'categoryId', 'payee', 'note']

/** The id of a transaction shown before the API has answered: it has no row version yet and cannot be edited or deleted. */
const pendingPrefix = 'pending:'
export const isPending = (transaction: Transaction) => transaction.id.startsWith(pendingPrefix)

/**
 * The user's transactions, newest date first and, within a date, last recorded first. A user has
 * thousands, so they are loaded a page at a time as the list asks for more.
 */
export const transactionsQuery = infiniteQueryOptions({
  queryKey: [...transactionsKey, 'list'],
  queryFn: async ({ pageParam }) => {
    const { data, response } = await api.GET('/api/v1/transactions', { params: { query: { cursor: pageParam } } })
    if (!data) throw new Error(`Could not load transactions: ${response.status}`)
    return data
  },
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (last) => last.nextCursor ?? undefined,
})

/**
 * Records a transaction, shown in the list at once. The idempotency key is made up by the caller, once per
 * transaction it means to record: sending the same one again after a failure cannot record it twice.
 */
export function useCreateTransaction() {
  return useSaveTransaction(
    async ({ fields, idempotencyKey }: TransactionDraft & { idempotencyKey: string }) =>
      api.POST('/api/v1/transactions', { params: { header: { 'Idempotency-Key': idempotencyKey } }, body: fields }),
    ({ idempotencyKey }) => ({ id: `${pendingPrefix}${idempotencyKey}`, rowVersion: '' }),
  )
}

/**
 * Edits the transaction from the row version it was read at, sent as `If-Match`; the list shows the change at
 * once. If the transaction has changed since (a 412) nothing is saved and the outcome is stale.
 */
export function useEditTransaction({ id, rowVersion }: Pick<Transaction, 'id' | 'rowVersion'>) {
  return useSaveTransaction(
    async ({ fields }: TransactionDraft) =>
      api.PUT('/api/v1/transactions/{id}', { params: { path: { id }, header: { 'If-Match': `"${rowVersion}"` } }, body: fields }),
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

type SaveResponse = { data?: Transaction; error?: unknown; response: Response }
type Lists = InfiniteData<TransactionPage, string | undefined>

/**
 * Saves a transaction optimistically (spec section 12): the lists show it as soon as it is sent, are put
 * back if it is not saved, and are loaded again, with the account balances, once the API has answered.
 */
function useSaveTransaction<Draft extends TransactionDraft>(
  save: (draft: Draft) => Promise<SaveResponse>,
  identify: (draft: Draft) => Pick<Transaction, 'id' | 'rowVersion'>,
) {
  const queryClient = useQueryClient()
  const lists = { queryKey: transactionsQuery.queryKey }

  return useMutation({
    mutationFn: async (draft: Draft): Promise<SaveOutcome> => {
      const { data, error, response } = await save(draft)
      if (data) return { saved: true, transaction: data }
      if (response.status === 412) return { saved: false, stale: true }
      const refused = refusedFields(response, error, transactionFields)
      if (refused) return { saved: false, fields: refused }
      throw new Error(`Saving a transaction failed: ${response.status}`)
    },
    onMutate: async (draft) => {
      // A list still loading would otherwise overwrite the optimistic one when it lands.
      await queryClient.cancelQueries(lists)
      const before = queryClient.getQueryData<Lists>(lists.queryKey)
      const { fields, currency } = draft
      const shown: Transaction = {
        ...identify(draft),
        ...fields,
        currency,
        payee: fields.payee?.trim() || null,
        note: fields.note?.trim() || null,
      }
      queryClient.setQueryData<Lists>(lists.queryKey, (data) => data && withTransaction(data, shown))
      return { before }
    },
    onError: (_error, _draft, context) => {
      queryClient.setQueryData(lists.queryKey, context?.before)
      // A request that failed may still have been saved.
      return refresh(queryClient)
    },
    onSuccess: (outcome, _draft, context) => {
      // Refused by the API: nothing changed there, so the lists go back to what they showed.
      if (!outcome.saved && 'fields' in outcome) {
        queryClient.setQueryData(lists.queryKey, context.before)
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
function comesBefore(a: Transaction, b: Transaction) {
  if (a.date !== b.date) return a.date > b.date
  if (isPending(a) !== isPending(b)) return isPending(a)
  return a.id > b.id
}

/**
 * The loaded pages with the transaction put where the list's order has it, in place of the one with its id if
 * there is one. A transaction that belongs after the pages loaded so far is left out, until those are loaded.
 */
function withTransaction(data: Lists, transaction: Transaction): Lists {
  const pages = data.pages.map((page) => ({ ...page, items: page.items.filter((item) => item.id !== transaction.id) }))
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
