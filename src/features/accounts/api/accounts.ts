import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { refusedFields } from '@/shared/api/refusedFields'
import type { components } from '@/shared/api/schema'

export type Account = components['schemas']['AccountResponse']
export type AccountType = components['schemas']['AccountType']
export type AccountFields = components['schemas']['AccountRequest']
/** The balance of the listed accounts at one institution (null: at none) in one currency, added up by the API. */
export type InstitutionTotal = components['schemas']['InstitutionTotalResponse']

/** Every account type, in the order the spec lists them. A type the API adds and this list lacks fails typecheck. */
export const accountTypes = ['current', 'savings', 'creditCard', 'cash', 'eWallet', 'loan'] as const satisfies readonly AccountType[]

type MissingType = Exclude<AccountType, (typeof accountTypes)[number]>
export const everyAccountTypeListed: MissingType extends never ? true : MissingType = true

/**
 * Whether an account of this type holds an amount owed: the user enters what they owe as a positive number,
 * sent as `amountOwed`, and the account shows a negative balance. Every other type sends `openingBalance`.
 */
export function holdsAmountOwed(type: AccountType): boolean {
  return type === 'creditCard' || type === 'loan'
}

/**
 * Whether an account of this type has a credit limit, a statement day and a payment due day: a credit card
 * only. The API refuses them on any other type.
 */
export function hasCreditCardFields(type: AccountType): boolean {
  return type === 'creditCard'
}

/** Fields the API can refuse, which the form shows its own translated message for. */
export type AccountField =
  | 'name'
  | 'type'
  | 'institutionId'
  | 'currency'
  | 'openingBalance'
  | 'amountOwed'
  | 'openingDate'
  | 'last4'
  | 'creditLimit'
  | 'statementDay'
  | 'paymentDueDay'

export type SaveOutcome =
  | { saved: true; account: Account }
  | { saved: false; fields: AccountField[] }
  /** The account changed since the row version the edit was made from: nothing was saved, and the list is loaded again. */
  | { saved: false; stale: true }

const accountsKey = ['accounts']
const accountFields: AccountField[] = [
  'name',
  'type',
  'institutionId',
  'currency',
  'openingBalance',
  'amountOwed',
  'openingDate',
  'last4',
  'creditLimit',
  'statementDay',
  'paymentDueDay',
]

/**
 * The user's accounts by name, each with its balance, and the total of each institution in each currency.
 * Archived accounts are left out unless asked for, as pickers need. A user has dozens, so every page is loaded;
 * every page carries the totals of the whole list.
 */
export const accountsQuery = ({ includeArchived = false }: { includeArchived?: boolean } = {}) =>
  queryOptions({
    queryKey: [...accountsKey, { includeArchived }],
    queryFn: async () => {
      const accounts: Account[] = []
      let totals: InstitutionTotal[]
      let cursor: string | undefined
      do {
        const { data, response } = await api.GET('/api/v1/accounts', { params: { query: { cursor, includeArchived } } })
        if (!data) throw new Error(`Could not load accounts: ${response.status}`)
        accounts.push(...data.items)
        totals = data.totals
        cursor = data.nextCursor ?? undefined
      } while (cursor)
      return { accounts, totals }
    },
  })

export function useCreateAccount() {
  return useSaveAccount(async (fields: AccountFields) => api.POST('/api/v1/accounts', { body: fields }))
}

/**
 * Edits the account from the row version it was read at, sent as `If-Match`. If the account has changed since
 * (a 412) nothing is saved and the outcome is stale.
 */
export function useEditAccount({ id, rowVersion }: Pick<Account, 'id' | 'rowVersion'>) {
  return useSaveAccount(async (fields: AccountFields) =>
    api.PUT('/api/v1/accounts/{id}', { params: { path: { id }, header: { 'If-Match': `"${rowVersion}"` } }, body: fields }),
  )
}

/** Archives the account, at any balance: what deleting one does. It leaves the list and pickers. */
export function useArchiveAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { response } = await api.DELETE('/api/v1/accounts/{id}', { params: { path: { id } } })
      if (!response.ok) throw new Error(`Archiving an account failed: ${response.status}`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountsKey }),
  })
}

type SaveResponse = { data?: Account; error?: unknown; response: Response }

function useSaveAccount(save: (fields: AccountFields) => Promise<SaveResponse>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (fields: AccountFields): Promise<SaveOutcome> => {
      const { data, error, response } = await save(fields)
      if (data) return { saved: true, account: data }
      if (response.status === 412) return { saved: false, stale: true }
      const refused = refusedFields(response, error, accountFields)
      if (refused) return { saved: false, fields: refused }
      throw new Error(`Saving an account failed: ${response.status}`)
    },
    // Saved, or stale: either way the list no longer shows what the API holds.
    onSuccess: (outcome) => {
      if (outcome.saved || 'stale' in outcome) return queryClient.invalidateQueries({ queryKey: accountsKey })
    },
  })
}
