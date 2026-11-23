import { http, HttpResponse } from 'msw'
import type { components } from '@/shared/api/schema'
import { fakeAttachmentsApi } from './fakeAttachmentsApi'
import type { FakeCategory } from './fakeCategoriesApi'
import { apiUrl, problem, refuseWithoutToken, server } from './server'

type Transaction = components['schemas']['TransactionResponse']
type TransactionRequest = components['schemas']['TransactionRequest']
type Transfer = components['schemas']['TransferResponse']
type TransferRequest = components['schemas']['TransferRequest']
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
 *
 * It answers the transfer endpoints too (see the API's TransferTests), since a transfer is two of these
 * transactions: a `transferOut` leg and a `transferIn` leg sharing a `transferId`, with no category. A transfer
 * is between two different accounts that are not archived; between accounts in one currency the two amounts
 * are the same, between currencies `toAmount` must be sent; its row version is its `transferOut` leg's; both
 * legs are edited and deleted together, and deleting a leg as a transaction deletes the other one too.
 */
export function fakeTransactionsApi(transactions: Partial<Transaction>[] = [], { accounts, categories, today = '2026-11-20' }: Options) {
  let recorded = 0
  const state = {
    transactions: transactions.map((transaction, index): Transaction => {
      const account = accounts.find((candidate) => candidate.id === transaction.accountId) ?? accounts[0]
      // A leg of a transfer has no category and no lines.
      const categoryId = transaction.transferId
        ? null
        : (transaction.categoryId ?? transaction.lines?.[0]?.categoryId ?? categories.find((category) => category.kind === (transaction.type ?? 'expense'))?.id ?? '')
      return {
        id: `01970000-0000-7000-8000-3000000000${String(index).padStart(2, '0')}`,
        type: 'expense',
        accountId: account?.id ?? '',
        amount: '1.00',
        currency: account?.currency ?? 'VND',
        date: '2026-11-02',
        payee: null,
        note: null,
        transferId: null,
        rowVersion: '1',
        recurringRuleId: null,
        // One line with the whole amount, unless the test seeds a split.
        lines: categoryId === null ? [] : [{ categoryId, amount: transaction.amount ?? '1.00', note: null }],
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
    /** Every POST and PUT body sent to the transfer endpoints, in the order they arrived. */
    transferRequests: [] as { method: string; body: Partial<TransferRequest> }[],
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
  const signed = (transaction: Transaction) =>
    (transaction.type === 'income' || transaction.type === 'transferIn' || transaction.isRefund ? 1 : -1) * Number(transaction.amount)
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
        transferId: null,
        lines: entered.map((line) => ({ categoryId: line.categoryId, amount: text(Number(line.amount)), note: line.note?.trim() || null })),
        isRefund: body.isRefund ?? false,
      },
    }
  }

  const legsOf = (transferId: unknown) => state.transactions.filter((transaction) => transaction.transferId === transferId)

  /** The two legs as the one transfer the API answers. */
  function transferOf(transferId: unknown): Transfer | undefined {
    const legs = legsOf(transferId)
    const out = legs.find((leg) => leg.type === 'transferOut')
    const into = legs.find((leg) => leg.type === 'transferIn')
    if (!out || !into) return undefined
    return {
      id: out.transferId!,
      fromAccountId: out.accountId,
      toAccountId: into.accountId,
      amount: out.amount,
      currency: out.currency,
      toAmount: into.amount,
      toCurrency: into.currency,
      date: out.date,
      note: out.note,
      outTransactionId: out.id,
      inTransactionId: into.id,
      rowVersion: out.rowVersion,
    }
  }

  const fits = (amount: string, currency: string) => (amount.split('.')[1] ?? '').replace(/0+$/, '').length <= decimals[currency]!
  const isAmount = (amount: unknown) => typeof amount === 'string' && /^\d+(\.\d+)?$/.test(amount) && Number(amount) > 0

  async function validatedTransfer(request: Request, current?: Transfer) {
    const body = (await request.json()) as Partial<TransferRequest>
    state.transferRequests.push({ method: request.method, body })
    const errors: Record<string, string[]> = {}
    if (!body.fromAccountId) errors.fromAccountId = ['This field is required.']
    if (!body.toAccountId) errors.toAccountId = ['This field is required.']
    if (!isAmount(body.amount)) errors.amount = ['Enter an amount greater than zero.']
    if (body.toAmount != null && !isAmount(body.toAmount)) errors.toAmount = ['Enter an amount greater than zero.']
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date ?? '')) errors.date = ['Enter a date as YYYY-MM-DD.']
    if ((body.note?.trim().length ?? 0) > 1000) errors.note = ['Enter a note of at most 1000 characters.']
    if (Object.keys(errors).length > 0) return { refused: problem(400, { errors }) }

    const invalid = (field: string, message: string) => ({ refused: problem(400, { errors: { [field]: [message] } }) })
    const from = accounts.find((candidate) => candidate.id === body.fromAccountId)
    if (!from || (from.isArchived && from.id !== current?.fromAccountId)) return invalid('fromAccountId', 'Choose one of your accounts that is not archived.')
    const to = accounts.find((candidate) => candidate.id === body.toAccountId)
    if (!to || (to.isArchived && to.id !== current?.toAccountId)) return invalid('toAccountId', 'Choose one of your accounts that is not archived.')
    if (body.toAmount == null && from.currency !== to.currency) return invalid('toAmount', 'Enter the amount that arrives.')
    const toAmount = body.toAmount ?? body.amount!
    if (from.id === to.id) return invalid('toAccountId', 'A transfer is between two different accounts.')
    if (from.currency === to.currency && Number(toAmount) !== Number(body.amount)) return invalid('toAmount', 'Accounts in the same currency move the same amount.')
    if (!fits(body.amount!, from.currency)) return invalid('amount', 'The amount has more decimals than its currency.')
    if (!fits(toAmount, to.currency)) return invalid('toAmount', 'The amount has more decimals than its currency.')
    if (body.date! > today) return invalid('date', "A transfer's date cannot be in the future.")

    const shared = { date: body.date!, categoryId: null, payee: null, note: body.note?.trim() || null, isRefund: false, lines: [], recurringRuleId: null }
    return {
      out: { ...shared, accountId: from.id, amount: text(Number(body.amount)), currency: from.currency },
      into: { ...shared, accountId: to.id, amount: text(Number(toAmount)), currency: to.currency },
    }
  }

  const answerTransfer = (transfer: Transfer, status = 200) => HttpResponse.json(transfer, { status, headers: { ETag: `"${transfer.rowVersion}"` } })

  function removeTransfer(transferId: unknown) {
    for (const leg of legsOf(transferId)) {
      move(leg, -1)
      state.transactions.splice(state.transactions.indexOf(leg), 1)
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
        times.set(category.id, (times.get(category.id) ?? 0) + 1)
      }
      const mostUsed = [...times].toSorted(([, a], [, b]) => b - a)[0]
      return HttpResponse.json({
        // Income and expenses only: a transfer does not change where quick add starts.
        lastAccountId: lastFirst.find((transaction) => !transaction.transferId && !isArchived(transaction.accountId))?.accountId ?? null,
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
        if (!sameBody || again.recorded.transferId) return problem(422, { type: 'urn:pfm:problem:idempotency-key-reused' })
        return HttpResponse.json(again.recorded, { status: 201, headers: { ETag: `"${again.recorded.rowVersion}"` } })
      }
      const body = JSON.stringify(await request.clone().json())
      const result = await validated(request)
      if (result.refused) return result.refused
      const created: Transaction = {
        id: `01970000-0000-7000-8000-4${String(recorded++).padStart(11, '0')}`,
        rowVersion: '1',
        // Only the worker posts for a rule; what a user records is linked to none.
        recurringRuleId: null,
        ...result.fields,
      }
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
      if (found.transferId) return problem(400, { errors: { type: ['This transaction is a leg of a transfer. Edit the transfer.'] } })
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
      if (found.transferId) {
        removeTransfer(found.transferId)
        return new HttpResponse(null, { status: 204 })
      }
      move(found, -1)
      state.transactions.splice(state.transactions.indexOf(found), 1)
      return new HttpResponse(null, { status: 204 })
    }),
    http.post(apiUrl('/api/v1/transfers'), async ({ request }) => {
      const key = request.headers.get('Idempotency-Key')
      state.idempotencyKeys.push(key)
      const stopped = await refusedOrFailed(request)
      if (stopped) return stopped
      const again = key === null ? undefined : byKey.get(key)
      if (again) {
        const sameBody = JSON.stringify(await request.clone().json()) === again.body
        const transfer = transferOf(again.recorded.transferId)
        if (!sameBody || !transfer) return problem(422, { type: 'urn:pfm:problem:idempotency-key-reused' })
        return answerTransfer(transfer, 201)
      }
      const body = JSON.stringify(await request.clone().json())
      const result = await validatedTransfer(request)
      if (result.refused) return result.refused
      const transferId = `01970000-0000-7000-8000-5${String(recorded).padStart(11, '0')}`
      const legs = (['transferOut', 'transferIn'] as const).map((type): Transaction => ({
        id: `01970000-0000-7000-8000-4${String(recorded++).padStart(11, '0')}`,
        rowVersion: '1',
        type,
        transferId,
        ...(type === 'transferOut' ? result.out : result.into),
      }))
      for (const leg of legs) {
        state.transactions.push(leg)
        order.set(leg.id, recorded)
        move(leg, 1)
      }
      if (key !== null) byKey.set(key, { recorded: legs[0]!, body })
      return answerTransfer(transferOf(transferId)!, 201)
    }),
    http.get(apiUrl('/api/v1/transfers/:id'), ({ params }) => {
      const transfer = transferOf(params.id)
      return transfer ? answerTransfer(transfer) : problem(404)
    }),
    http.put(apiUrl('/api/v1/transfers/:id'), async ({ request, params }) => {
      const ifMatch = request.headers.get('If-Match')
      state.ifMatches.push(ifMatch)
      const stopped = await refusedOrFailed(request)
      if (stopped) return stopped
      if (ifMatch === null) return problem(428)
      const transfer = transferOf(params.id)
      if (!transfer) return problem(404)
      if (ifMatch !== `"${transfer.rowVersion}"`) return problem(412)
      const result = await validatedTransfer(request, transfer)
      if (result.refused) return result.refused
      for (const leg of legsOf(params.id)) {
        move(leg, -1)
        Object.assign(leg, leg.type === 'transferOut' ? result.out : result.into, { rowVersion: String(Number(leg.rowVersion) + 1) })
        move(leg, 1)
      }
      return answerTransfer(transferOf(params.id)!)
    }),
    http.delete(apiUrl('/api/v1/transfers/:id'), async ({ request, params }) => {
      const stopped = await refusedOrFailed(request)
      if (stopped) return stopped
      if (legsOf(params.id).length === 0) return problem(404)
      removeTransfer(params.id)
      return new HttpResponse(null, { status: 204 })
    }),
  )

  // A transaction's drawer loads its attachments: none, unless a test sets up `fakeAttachmentsApi` itself afterwards.
  fakeAttachmentsApi([], { transactions: state.transactions })

  return state
}
