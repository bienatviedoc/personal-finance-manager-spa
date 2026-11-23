import { http, HttpResponse } from 'msw'
import type { components } from '@/shared/api/schema'
import type { FakeCategory } from './fakeCategoriesApi'
import { apiUrl, problem, refuseWithoutToken, server } from './server'

type Transaction = components['schemas']['TransactionResponse']
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
 * as the real API (see the API's TransactionTests): the list is newest date first and, within a date, last
 * recorded first, a page at a time; the currency is the account's; the amount is above zero with no more
 * decimals than the currency has; the date is not in the future; income takes an income category and an
 * expense an expense category; only an expense can be a refund, which raises the balance; archived accounts
 * and categories take no new transactions; a transaction has one line with its category and whole amount, or
 * is split across the `lines` sent in place of `categoryId` (at least two, each held to the rules of a
 * category and an amount, and together exactly the amount; what is wrong with one is refused as
 * `lines[1].categoryId`); a POST sent
 * again with the same `Idempotency-Key` records nothing, and one with that key and a different body is a 422; an edit must name the row version in `If-Match`
 * (412 when stale, 428 when missing); deleting takes the transaction out of the list. The balance of the
 * account a transaction is on follows it. Quick add answers the account, not archived, recorded on last, and the
 * category, not archived, most often used for a payee (see the API's QuickAddTests).
 */
export function fakeTransactionsApi(transactions: Partial<Transaction>[] = [], { accounts, categories, today = '2026-11-20' }: Options) {
  let recorded = 0
  const state = {
    transactions: transactions.map((transaction, index): Transaction => {
      const account = accounts.find((candidate) => candidate.id === transaction.accountId) ?? accounts[0]
      const categoryId =
        transaction.categoryId ?? transaction.lines?.[0]?.categoryId ?? categories.find((category) => category.kind === (transaction.type ?? 'expense'))?.id ?? ''
      return {
        id: `01970000-0000-7000-8000-3000000000${String(index).padStart(2, '0')}`,
        type: 'expense',
        accountId: account?.id ?? '',
        amount: '1.00',
        currency: account?.currency ?? 'VND',
        date: '2026-11-02',
        payee: null,
        note: null,
        rowVersion: '1',
        // One line with the whole amount, unless the test seeds a split.
        lines: [{ categoryId, amount: transaction.amount ?? '1.00', note: null }],
        isRefund: false,
        ...transaction,
        categoryId,
      }
    }),
    /** The `Idempotency-Key` header of every POST, in the order they arrived. */
    idempotencyKeys: [] as (string | null)[],
    /** The `If-Match` header of every edit, in the order they arrived. */
    ifMatches: [] as (string | null)[],
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
  let failing = false
  /** What each `Idempotency-Key` recorded, and the body it came with. */
  const byKey = new Map<string, { recorded: Transaction; body: string }>()
  /** When each transaction was recorded: later is higher. Seeded ones in the order given. */
  const order = new Map(state.transactions.map((transaction, index) => [transaction.id, index - state.transactions.length]))

  const find = (id: unknown) => state.transactions.find((transaction) => transaction.id === id)
  // The type gives the sign, except that a refund raises the balance.
  const signed = (transaction: Transaction) => (transaction.type === 'income' || transaction.isRefund ? 1 : -1) * Number(transaction.amount)
  const move = (transaction: Transaction, direction: 1 | -1) => {
    const account = accounts.find((candidate) => candidate.id === transaction.accountId)
    if (account) account.balance = text(Number(account.balance) + direction * signed(transaction))
  }

  async function validated(request: Request, current?: Transaction) {
    const body = (await request.json()) as Partial<TransactionRequest>
    state.requests.push({ method: request.method, body })
    const errors: Record<string, string[]> = {}
    if (body.type !== 'income' && body.type !== 'expense') errors.type = ['Choose one of: income, expense.']
    if (!body.accountId) errors.accountId = ['This field is required.']
    if (!/^\d+(\.\d+)?$/.test(body.amount ?? '') || Number(body.amount) <= 0) errors.amount = ['Enter an amount greater than zero.']
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date ?? '')) errors.date = ['Enter a date as YYYY-MM-DD.']
    const split = body.lines ?? null
    if (split ? body.categoryId : !body.categoryId) errors.categoryId = [split ? 'Leave out the category of a split.' : 'This field is required.']
    if (split && split.length < 2) errors.lines = ['Split a transaction across 2 to 50 lines.']
    split?.forEach((line, index) => {
      if (!line.categoryId) errors[`lines[${index}].categoryId`] = ['This field is required.']
      if (!/^\d+(\.\d+)?$/.test(line.amount ?? '') || Number(line.amount) <= 0) errors[`lines[${index}].amount`] = ['Enter an amount greater than zero.']
      if ((line.note?.trim().length ?? 0) > 1000) errors[`lines[${index}].note`] = ['Enter a note of at most 1000 characters.']
    })
    if ((body.payee?.trim().length ?? 0) > 200) errors.payee = ['Enter a payee of at most 200 characters.']
    if ((body.note?.trim().length ?? 0) > 1000) errors.note = ['Enter a note of at most 1000 characters.']
    if (Object.keys(errors).length > 0) return { refused: problem(400, { errors }) }

    const invalid = (field: string, message: string) => ({ refused: problem(400, { errors: { [field]: [message] } }) })
    const account = accounts.find((candidate) => candidate.id === body.accountId)
    if (!account || (account.isArchived && account.id !== current?.accountId)) {
      return invalid('accountId', 'Choose one of your accounts that is not archived.')
    }
    const fits = (amount: string) => (amount.split('.')[1] ?? '').replace(/0+$/, '').length <= decimals[account.currency]!
    if (!fits(body.amount!)) return invalid('amount', 'The amount has more decimals than its currency.')
    if (body.date! > today) return invalid('date', "A transaction's date cannot be in the future.")
    // A transaction that is not split is held to the same rules as one line with its category and whole amount.
    const entered = split ?? [{ categoryId: body.categoryId!, amount: body.amount!, note: null }]
    for (const [index, line] of entered.entries()) {
      const at = split ? `lines[${index}].` : ''
      const category = categories.find((candidate) => candidate.id === line.categoryId)
      if (!category || (category.isArchived && !current?.lines.some((has) => has.categoryId === category.id))) {
        return invalid(`${at}categoryId`, 'Choose one of your categories that is not archived.')
      }
      if (category.kind !== body.type) return invalid(`${at}categoryId`, 'An income transaction takes an income category.')
      if (!fits(line.amount)) return invalid(`${at}amount`, 'The amount has more decimals than its currency.')
    }
    // Test amounts are small, so numbers add them up exactly enough: to the cent.
    const cents = (amount: string) => Math.round(Number(amount) * 100)
    if (entered.reduce((left, line) => left - cents(line.amount), cents(body.amount!)) !== 0) {
      return invalid('lines', "The lines of a split sum to the transaction's amount.")
    }
    if (body.isRefund && body.type !== 'expense') return invalid('isRefund', 'Only an expense can be a refund.')

    return {
      fields: {
        type: body.type as Transaction['type'],
        accountId: account.id,
        amount: text(Number(body.amount)),
        currency: account.currency,
        date: body.date!,
        categoryId: entered[0]!.categoryId,
        payee: body.payee?.trim() || null,
        note: body.note?.trim() || null,
        lines: entered.map((line) => ({ categoryId: line.categoryId, amount: text(Number(line.amount)), note: line.note?.trim() || null })),
        isRefund: body.isRefund ?? false,
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
    http.get(apiUrl('/api/v1/transactions'), ({ request }) => {
      const query = new URL(request.url).searchParams
      const limit = Number(query.get('limit') ?? 50)
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) return problem(400, { errors: { limit: ['Ask for 1 to 100 at a time.'] } })
      const sorted = state.transactions.toSorted((a, b) => b.date.localeCompare(a.date) || order.get(b.id)! - order.get(a.id)!)
      // The real cursor is opaque; this one is the id of the page's last transaction.
      const cursor = query.get('cursor')
      const start = cursor === null ? 0 : sorted.findIndex((transaction) => transaction.id === cursor) + 1
      if (cursor !== null && start === 0) return problem(400, { errors: { cursor: ['Use the nextCursor of the page before.'] } })
      const items = sorted.slice(start, start + limit)
      return HttpResponse.json({ items, nextCursor: start + limit < sorted.length ? items.at(-1)!.id : null })
    }),
    // Before the handler for one transaction, which would take "quick-add" for an id.
    http.get(apiUrl('/api/v1/transactions/quick-add'), ({ request }) => {
      const query = new URL(request.url).searchParams
      const type = query.get('type')
      const payee = query.get('payee')?.trim().toLowerCase()
      const lastFirst = state.transactions.toSorted((a, b) => order.get(b.id)! - order.get(a.id)!)
      const isArchived = (id: string) => accounts.find((account) => account.id === id)?.isArchived ?? true
      // How often each category was used for the payee; the first counted is the one used last.
      const times = new Map<string, number>()
      for (const transaction of lastFirst) {
        const category = categories.find((candidate) => candidate.id === transaction.categoryId)
        if (!payee || transaction.payee?.toLowerCase() !== payee || (type && transaction.type !== type) || !category || category.isArchived) continue
        times.set(transaction.categoryId, (times.get(transaction.categoryId) ?? 0) + 1)
      }
      const mostUsed = [...times].toSorted(([, a], [, b]) => b - a)[0]
      return HttpResponse.json({
        lastAccountId: lastFirst.find((transaction) => !isArchived(transaction.accountId))?.accountId ?? null,
        suggestedCategoryId: mostUsed?.[0] ?? null,
      })
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
