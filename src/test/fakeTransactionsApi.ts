import { http, HttpResponse } from 'msw'
import type { components } from '@/shared/api/schema'
import type { FakeCategory } from './fakeCategoriesApi'
import { apiUrl, problem, refuseWithoutToken, server } from './server'

type Transaction = components['schemas']['TransactionResponse']
type TransactionList = components['schemas']['TransactionListResponse']
type TransactionRequest = components['schemas']['TransactionRequest']
type Account = components['schemas']['AccountResponse']

const decimals: Record<string, number> = { VND: 0, USD: 2, EUR: 2 }

/** An amount as the API writes it: at least two decimals. Test amounts are small, so a number holds them. */
const text = (amount: number) => amount.toFixed(2)

type Options = {
  /** The accounts transactions are on, as `fakeAccountsApi` keeps them: their balances follow the transactions. */
  accounts: Account[]
  /** The categories transactions take, as `fakeCategoriesApi` keeps them. */
  categories: FakeCategory[]
  /** Today's date for the user; dates after it are refused. */
  today?: string
}

/**
 * A stand-in for the API's transaction endpoints, keeping state across requests and following the same rules
 * as the real API (see the API's TransactionTests and TransactionListTests): the list holds the transactions
 * that pass every filter sent, newest date first and, within a date, last recorded first unless `sort` and
 * `order` say otherwise, a page at a time, with the total of all that pass; the currency is the account's; the amount is above zero with no more
 * decimals than the currency has; the date is not in the future; income takes an income category and an
 * expense an expense category; archived accounts and categories take no new transactions; a POST sent
 * again with the same `Idempotency-Key` records nothing, and one with that key and a different body is a 422; an edit must name the row version in `If-Match`
 * (412 when stale, 428 when missing); deleting takes the transaction out of the list. The balance of the
 * account a transaction is on follows it.
 */
export function fakeTransactionsApi(transactions: Partial<Transaction>[] = [], { accounts, categories, today = '2026-11-20' }: Options) {
  let recorded = 0
  const state = {
    transactions: transactions.map((transaction, index): Transaction => {
      const account = accounts.find((candidate) => candidate.id === transaction.accountId) ?? accounts[0]
      return {
        id: `01970000-0000-7000-8000-3000000000${String(index).padStart(2, '0')}`,
        type: 'expense',
        accountId: account?.id ?? '',
        amount: '1.00',
        currency: account?.currency ?? 'VND',
        date: '2026-11-02',
        categoryId: categories.find((category) => category.kind === (transaction.type ?? 'expense'))?.id ?? '',
        payee: null,
        note: null,
        rowVersion: '1',
        ...transaction,
      }
    }),
    /** The `Idempotency-Key` header of every POST, in the order they arrived. */
    idempotencyKeys: [] as (string | null)[],
    /** The `If-Match` header of every edit, in the order they arrived. */
    ifMatches: [] as (string | null)[],
    /** The query of every request for the list, in the order they arrived. */
    listQueries: [] as Record<string, string>[],
    /** Holds every answer to a request for the list until the returned function is called, so a test can look at the screen while it loads. */
    holdLists() {
      let release!: () => void
      heldLists = new Promise<void>((resolve) => (release = resolve))
      return () => {
        heldLists = undefined
        release()
      }
    },
    /** Every POST and PUT body, in the order they arrived. */
    requests: [] as { method: string; body: Partial<TransactionRequest> }[],
    /**
     * Holds every answer to a request that changes something until the returned function is called, so a
     * test can look at the screen while the API has not answered yet.
     */
    hold() {
      let release!: () => void
      held = new Promise<void>((resolve) => (release = resolve))
      return release
    },
    /** The next request that changes something fails with a 500, having saved nothing. */
    failNext() {
      failing = true
    },
  }
  let held: Promise<void> | undefined
  let heldLists: Promise<void> | undefined
  let failing = false
  /** What each `Idempotency-Key` recorded, and the body it came with. */
  const byKey = new Map<string, { recorded: Transaction; body: string }>()
  /** When each transaction was recorded: later is higher. Seeded ones in the order given. */
  const order = new Map(state.transactions.map((transaction, index) => [transaction.id, index - state.transactions.length]))

  const find = (id: unknown) => state.transactions.find((transaction) => transaction.id === id)
  const signed = (transaction: Transaction) => (transaction.type === 'income' ? 1 : -1) * Number(transaction.amount)
  const move = (transaction: Transaction, direction: 1 | -1) => {
    const account = accounts.find((candidate) => candidate.id === transaction.accountId)
    if (account) account.balance = text(Number(account.balance) + direction * signed(transaction))
  }

  /** The filters and sort order the API would refuse, each with a message under its name. */
  function unreadable(query: URLSearchParams) {
    const errors: Record<string, string[]> = {}
    const check = (name: string, readable: (value: string) => boolean, message: string) => {
      const value = query.get(name)
      if (value !== null && !readable(value)) errors[name] = [message]
    }
    const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
    const isAmount = (value: string) => /^\d+(\.\d+)?$/.test(value)
    check('from', isDate, 'Enter a date as YYYY-MM-DD.')
    check('to', isDate, 'Enter a date as YYYY-MM-DD.')
    check('type', (value) => value === 'income' || value === 'expense', 'Choose one of: income, expense.')
    check('min', isAmount, 'Enter an amount that is not negative, such as 125000.00.')
    check('max', isAmount, 'Enter an amount that is not negative, such as 125000.00.')
    check('q', (value) => value.trim().length <= 200, 'Search for at most 200 characters.')
    check('sort', (value) => value === 'date' || value === 'amount', 'Choose one of: date, amount.')
    check('order', (value) => value === 'asc' || value === 'desc', 'Choose one of: asc, desc.')
    return errors
  }

  /** Whether a transaction passes every filter sent: both ends of a range included, a category with its subcategories, the search anywhere in the payee or note. */
  function passes(query: URLSearchParams) {
    const filter = (name: string) => query.get(name) ?? undefined
    const search = filter('q')?.trim().toLowerCase()
    const inCategory = (transaction: Transaction, id: string) =>
      transaction.categoryId === id || categories.find((category) => category.id === transaction.categoryId)?.parentId === id
    return (transaction: Transaction) =>
      (filter('from') === undefined || transaction.date >= filter('from')!) &&
      (filter('to') === undefined || transaction.date <= filter('to')!) &&
      (filter('accountId') === undefined || transaction.accountId === filter('accountId')) &&
      (filter('categoryId') === undefined || inCategory(transaction, filter('categoryId')!)) &&
      (filter('type') === undefined || transaction.type === filter('type')) &&
      (filter('min') === undefined || Number(transaction.amount) >= Number(filter('min'))) &&
      (filter('max') === undefined || Number(transaction.amount) <= Number(filter('max'))) &&
      (!search || [transaction.payee, transaction.note].some((field) => field?.toLowerCase().includes(search)))
  }

  /** What the transactions come to: how many, and income, expenses and net in each currency, never added across currencies. */
  function totalOf(passing: Transaction[]): TransactionList['total'] {
    const sum = (of: Transaction[]) => text(of.reduce((total, transaction) => total + Number(transaction.amount), 0))
    return {
      count: passing.length,
      currencies: (Object.keys(decimals) as Transaction['currency'][])
        .map((currency) => passing.filter((transaction) => transaction.currency === currency))
        .filter((inCurrency) => inCurrency.length > 0)
        .map((inCurrency) => ({
          currency: inCurrency[0]!.currency,
          income: sum(inCurrency.filter((transaction) => transaction.type === 'income')),
          expenses: sum(inCurrency.filter((transaction) => transaction.type === 'expense')),
          net: text(inCurrency.reduce((total, transaction) => total + signed(transaction), 0)),
        })),
    }
  }

  async function validated(request: Request, current?: Transaction) {
    const body = (await request.json()) as Partial<TransactionRequest>
    state.requests.push({ method: request.method, body })
    const errors: Record<string, string[]> = {}
    if (body.type !== 'income' && body.type !== 'expense') errors.type = ['Choose one of: income, expense.']
    if (!body.accountId) errors.accountId = ['This field is required.']
    if (!/^\d+(\.\d+)?$/.test(body.amount ?? '') || Number(body.amount) <= 0) errors.amount = ['Enter an amount greater than zero.']
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date ?? '')) errors.date = ['Enter a date as YYYY-MM-DD.']
    if (!body.categoryId) errors.categoryId = ['This field is required.']
    if ((body.payee?.trim().length ?? 0) > 200) errors.payee = ['Enter a payee of at most 200 characters.']
    if ((body.note?.trim().length ?? 0) > 1000) errors.note = ['Enter a note of at most 1000 characters.']
    if (Object.keys(errors).length > 0) return { refused: problem(400, { errors }) }

    const invalid = (field: string, message: string) => ({ refused: problem(400, { errors: { [field]: [message] } }) })
    const account = accounts.find((candidate) => candidate.id === body.accountId)
    if (!account || (account.isArchived && account.id !== current?.accountId)) {
      return invalid('accountId', 'Choose one of your accounts that is not archived.')
    }
    const category = categories.find((candidate) => candidate.id === body.categoryId)
    if (!category || (category.isArchived && category.id !== current?.categoryId)) {
      return invalid('categoryId', 'Choose one of your categories that is not archived.')
    }
    const fraction = (body.amount!.split('.')[1] ?? '').replace(/0+$/, '')
    if (fraction.length > decimals[account.currency]!) return invalid('amount', 'The amount has more decimals than its currency.')
    if (body.date! > today) return invalid('date', "A transaction's date cannot be in the future.")
    if (category.kind !== body.type) return invalid('categoryId', 'An income transaction takes an income category.')

    return {
      fields: {
        type: body.type as Transaction['type'],
        accountId: account.id,
        amount: text(Number(body.amount)),
        currency: account.currency,
        date: body.date!,
        categoryId: category.id,
        payee: body.payee?.trim() || null,
        note: body.note?.trim() || null,
      },
    }
  }

  /** What every request that changes something goes through first: the token, a held answer, a planned failure. */
  async function refusedOrFailed(request: Request) {
    const refused = refuseWithoutToken(request)
    if (refused) return refused
    await held
    if (failing) {
      failing = false
      return problem(500)
    }
    return null
  }

  server.use(
    http.get(apiUrl('/api/v1/transactions'), async ({ request }) => {
      const query = new URL(request.url).searchParams
      state.listQueries.push(Object.fromEntries(query))
      await heldLists
      const limit = Number(query.get('limit') ?? 50)
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) return problem(400, { errors: { limit: ['Ask for 1 to 100 at a time.'] } })
      const errors = unreadable(query)
      if (Object.keys(errors).length > 0) return problem(400, { errors })

      const passing = state.transactions.filter(passes(query))
      const by = query.get('sort') ?? 'date'
      const direction = query.get('order') === 'asc' ? 1 : -1
      const sorted = passing.toSorted(
        (a, b) =>
          direction * ((by === 'amount' ? Number(a.amount) - Number(b.amount) : a.date.localeCompare(b.date)) || order.get(a.id)! - order.get(b.id)!),
      )
      // The real cursor is opaque; this one is the id of the page's last transaction.
      const cursor = query.get('cursor')
      const start = cursor === null ? 0 : sorted.findIndex((transaction) => transaction.id === cursor) + 1
      if (cursor !== null && start === 0) return problem(400, { errors: { cursor: ['Use the nextCursor of the page before.'] } })
      const items = sorted.slice(start, start + limit)
      return HttpResponse.json({ items, nextCursor: start + limit < sorted.length ? items.at(-1)!.id : null, total: totalOf(passing) })
    }),
    http.get(apiUrl('/api/v1/transactions/:id'), ({ params }) => {
      const found = find(params.id)
      return found ? HttpResponse.json(found, { headers: { ETag: `"${found.rowVersion}"` } }) : problem(404)
    }),
    http.post(apiUrl('/api/v1/transactions'), async ({ request }) => {
      const key = request.headers.get('Idempotency-Key')
      state.idempotencyKeys.push(key)
      const stopped = await refusedOrFailed(request)
      if (stopped) return stopped
      const again = key === null ? undefined : byKey.get(key)
      if (again) {
        const sameBody = JSON.stringify(await request.clone().json()) === again.body
        if (!sameBody) return problem(422, { type: 'urn:pfm:problem:idempotency-key-reused' })
        return HttpResponse.json(again.recorded, { status: 201, headers: { ETag: `"${again.recorded.rowVersion}"` } })
      }
      const body = JSON.stringify(await request.clone().json())
      const result = await validated(request)
      if (result.refused) return result.refused
      const created: Transaction = { id: `01970000-0000-7000-8000-4${String(recorded++).padStart(11, '0')}`, rowVersion: '1', ...result.fields }
      state.transactions.push(created)
      order.set(created.id, recorded)
      if (key !== null) byKey.set(key, { recorded: created, body })
      move(created, 1)
      return HttpResponse.json(created, { status: 201, headers: { ETag: `"${created.rowVersion}"` } })
    }),
    http.put(apiUrl('/api/v1/transactions/:id'), async ({ request, params }) => {
      const ifMatch = request.headers.get('If-Match')
      state.ifMatches.push(ifMatch)
      const stopped = await refusedOrFailed(request)
      if (stopped) return stopped
      if (ifMatch === null) return problem(428)
      const found = find(params.id)
      if (!found) return problem(404)
      if (ifMatch !== `"${found.rowVersion}"`) return problem(412)
      const result = await validated(request, found)
      if (result.refused) return result.refused
      move(found, -1)
      Object.assign(found, result.fields, { rowVersion: String(Number(found.rowVersion) + 1) })
      move(found, 1)
      return HttpResponse.json(found, { headers: { ETag: `"${found.rowVersion}"` } })
    }),
    http.delete(apiUrl('/api/v1/transactions/:id'), async ({ request, params }) => {
      const stopped = await refusedOrFailed(request)
      if (stopped) return stopped
      const found = find(params.id)
      if (!found) return problem(404)
      move(found, -1)
      state.transactions.splice(state.transactions.indexOf(found), 1)
      return new HttpResponse(null, { status: 204 })
    }),
  )

  return state
}
