import { http, HttpResponse } from 'msw'
import type { components } from '@/shared/api/schema'
import { apiUrl, problem, refuseWithoutToken, server } from './server'

type Account = components['schemas']['AccountResponse']
type AccountRequest = components['schemas']['AccountRequest']
type InstitutionTotal = components['schemas']['InstitutionTotalResponse']

const types = ['current', 'savings', 'creditCard', 'cash', 'eWallet', 'loan']
const owedTypes = ['creditCard', 'loan']
const decimals: Record<string, number> = { VND: 0, USD: 2, EUR: 2 }

/** An amount as the API writes it: at least two decimals. Test amounts are small, so a number holds them. */
const text = (amount: number) => amount.toFixed(2)

type Options = {
  /** The institutions an account may be put with, as `fakeInstitutionsApi` keeps them. Without it any institution is taken. */
  institutions?: { id: string; isArchived: boolean }[]
}

/**
 * A stand-in for the API's account endpoints, keeping state across requests and following the same rules
 * as the real API (see the API's AccountTests): the list is by name, a page at a time, without archived
 * accounts unless asked, and carries the total of each institution in each currency; a credit card or loan
 * takes `amountOwed` and holds it as a negative balance; with no transactions the balance is the opening
 * balance; an edit must name the row version in `If-Match` (412 when stale, 428 when missing); deleting
 * archives.
 */
export function fakeAccountsApi(accounts: Partial<Account>[] = [], { institutions }: Options = {}) {
  const state = {
    accounts: accounts.map((account, index): Account => {
      const openingBalance = account.openingBalance ?? '0.00'
      return {
        id: `01970000-0000-7000-8000-2000000000${String(index).padStart(2, '0')}`,
        institutionId: null,
        name: `Account ${index}`,
        type: 'current',
        currency: 'VND',
        amountOwed: null,
        openingDate: '2026-11-01',
        isArchived: false,
        rowVersion: '1',
        ...account,
        openingBalance,
        balance: account.balance ?? openingBalance,
      }
    }),
    /** The `If-Match` header of every edit, in the order they arrived. */
    ifMatches: [] as (string | null)[],
  }

  const find = (id: unknown) => state.accounts.find((account) => account.id === id)

  async function validated(request: Request, current?: Account) {
    const body = (await request.json()) as Partial<AccountRequest>
    const name = body.name?.trim() ?? ''
    const errors: Record<string, string[]> = {}
    if (name.length === 0 || name.length > 100) errors.name = ['Enter a name of at most 100 characters.']
    if (!body.type || !types.includes(body.type)) errors.type = ['Choose one of the account types.']
    if (!body.currency || !(body.currency in decimals)) errors.currency = ['Choose one of the currencies.']
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.openingDate ?? '')) errors.openingDate = ['Enter a date as YYYY-MM-DD.']

    const owed = owedTypes.includes(body.type ?? '')
    const [sent, other] = owed ? (['amountOwed', 'openingBalance'] as const) : (['openingBalance', 'amountOwed'] as const)
    if (!errors.type && !errors.currency) {
      const amount = body[sent] ?? ''
      // Zeros past the currency's decimals change nothing: "1000.00" is a VND amount.
      const fraction = (amount.split('.')[1] ?? '').replace(/0+$/, '')
      const fits = /^-?\d{1,15}(\.\d+)?$/.test(amount) && fraction.length <= decimals[body.currency!]! && !(owed && amount.startsWith('-'))
      if (!fits) errors[sent] = ['Enter an amount.']
      if (body[other] != null) errors[other] = ['This type of account does not take it.']
    }
    if (Object.keys(errors).length > 0) return { refused: problem(400, { errors }) }

    const institutionId = body.institutionId ?? null
    if (institutionId !== null && institutionId !== current?.institutionId && institutions) {
      const institution = institutions.find((candidate) => candidate.id === institutionId)
      if (!institution || institution.isArchived) {
        return { refused: problem(400, { errors: { institutionId: ['Choose one of your institutions that is not archived.'] } }) }
      }
    }

    const amount = Number(body[sent])
    const openingBalance = text(owed ? -amount : amount)
    return {
      fields: {
        institutionId,
        name,
        type: body.type as Account['type'],
        currency: body.currency as Account['currency'],
        openingBalance,
        amountOwed: owed ? text(amount) : null,
        openingDate: body.openingDate!,
        // No transactions yet: the balance is the opening balance.
        balance: openingBalance,
      },
    }
  }

  function totalsOf(listed: Account[]): InstitutionTotal[] {
    const totals = new Map<string, InstitutionTotal & { sum: number }>()
    for (const account of listed) {
      const key = `${account.institutionId}:${account.currency}`
      const total = totals.get(key) ?? { institutionId: account.institutionId, currency: account.currency, balance: '', sum: 0 }
      total.sum += Number(account.balance)
      totals.set(key, total)
    }
    return [...totals.values()].map(({ sum, ...total }) => ({ ...total, balance: text(sum) }))
  }

  server.use(
    http.get(apiUrl('/api/v1/accounts'), ({ request }) => {
      const query = new URL(request.url).searchParams
      const includeArchived = query.get('includeArchived') === 'true'
      const limit = Number(query.get('limit') ?? 50)
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) return problem(400, { errors: { limit: ['Ask for 1 to 100 at a time.'] } })
      const sorted = state.accounts
        .filter((account) => includeArchived || !account.isArchived)
        .toSorted((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id))
      // The real cursor is opaque; this one is the id of the page's last account.
      const cursor = query.get('cursor')
      const start = cursor === null ? 0 : sorted.findIndex((account) => account.id === cursor) + 1
      if (cursor !== null && start === 0) return problem(400, { errors: { cursor: ['Use the nextCursor of the page before.'] } })
      const items = sorted.slice(start, start + limit)
      const nextCursor = start + limit < sorted.length ? items.at(-1)!.id : null
      return HttpResponse.json({ items, nextCursor, totals: totalsOf(sorted) })
    }),
    http.get(apiUrl('/api/v1/accounts/:id'), ({ params }) => {
      const found = find(params.id)
      return found ? HttpResponse.json(found, { headers: { ETag: `"${found.rowVersion}"` } }) : problem(404)
    }),
    http.post(apiUrl('/api/v1/accounts'), async ({ request }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const result = await validated(request)
      if (result.refused) return result.refused
      const created: Account = { id: crypto.randomUUID(), isArchived: false, rowVersion: '1', ...result.fields }
      state.accounts.push(created)
      return HttpResponse.json(created, { status: 201, headers: { ETag: `"${created.rowVersion}"` } })
    }),
    http.put(apiUrl('/api/v1/accounts/:id'), async ({ request, params }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const ifMatch = request.headers.get('If-Match')
      state.ifMatches.push(ifMatch)
      if (ifMatch === null) return problem(428)
      const found = find(params.id)
      if (!found) return problem(404)
      if (ifMatch !== `"${found.rowVersion}"`) return problem(412)
      const result = await validated(request, found)
      if (result.refused) return result.refused
      Object.assign(found, result.fields, { rowVersion: String(Number(found.rowVersion) + 1) })
      return HttpResponse.json(found, { headers: { ETag: `"${found.rowVersion}"` } })
    }),
    http.delete(apiUrl('/api/v1/accounts/:id'), ({ request, params }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const found = find(params.id)
      if (!found) return problem(404)
      if (!found.isArchived) Object.assign(found, { isArchived: true, rowVersion: String(Number(found.rowVersion) + 1) })
      return new HttpResponse(null, { status: 204 })
    }),
  )

  return state
}
