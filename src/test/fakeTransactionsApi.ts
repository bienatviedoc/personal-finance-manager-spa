import { http, HttpResponse } from 'msw'
import type { components } from '@/shared/api/schema'
import { fakeAttachmentsApi } from './fakeAttachmentsApi'
import type { FakeCategory } from './fakeCategoriesApi'
import { apiUrl, problem, refuseWithoutToken, server } from './server'

type Transaction = components['schemas']['TransactionResponse']
type TransactionList = components['schemas']['TransactionListResponse']
type TransactionRequest = components['schemas']['TransactionRequest']
type Transfer = components['schemas']['TransferResponse']
type TransferRequest = components['schemas']['TransferRequest']
type Account = components['schemas']['AccountResponse']
type MarkRequest = components['schemas']['MarkAsTransferRequest']
type UnmarkRequest = components['schemas']['UnmarkTransferRequest']
type DeletedTransaction = components['schemas']['DeletedTransactionResponse']

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
 * expense an expense category; only an expense can be a refund, which raises the balance; archived accounts
 * and categories take no new transactions; a transaction has one line with its category and whole amount, or
 * is split across the `lines` sent in place of `categoryId` (at least two, each held to the rules of a
 * category and an amount, and together exactly the amount; what is wrong with one is refused as
 * `lines[1].categoryId`); a POST sent
 * again with the same `Idempotency-Key` records nothing, and one with that key and a different body is a 422; an edit must name the row version in `If-Match`
 * (412 when stale, 428 when missing); deleting takes the transaction out of the list. The balance of the
 * account a transaction is on follows it. Quick add answers the account, not archived, recorded on last, and the
 * category, not archived, on the most lines of a payee's transactions that are not refunds (see the API's QuickAddTests).
 * Search finds a line's note too, and filtered by a category the total adds only the lines in it, and says what
 * they spent there in the base currency, VND, as a budget counts it: an expense in another currency has no rate
 * here, so it is not converted and left out.
 *
 * It answers the transfer endpoints too (see the API's TransferTests), since a transfer is two of these
 * transactions: a `transferOut` leg and a `transferIn` leg sharing a `transferId`, with no category. A transfer
 * is between two different accounts that are not archived; between accounts in one currency the two amounts
 * are the same, between currencies `toAmount` must be sent; its row version is its `transferOut` leg's; both
 * legs are edited and deleted together, and deleting a leg as a transaction deletes the other one too.
 *
 * Marking as a transfer (see the API's MarkAsTransferTests) makes an expense that is not a refund the
 * `transferOut` leg and income on another account the `transferIn` leg, on the same date and, in one currency, of
 * the same amount; either is refused on its id (`expenseId`, `incomeId`) when it is not one, is a leg already, or
 * breaks a rule of the pair (then on `incomeId`). Unmarking turns a transfer's legs back into an expense and
 * income on the categories sent, each of its kind and not archived.
 *
 * A reconciled transaction (`isReconciled`, which `fakeReconciliationsApi` sets) is locked (see the API's
 * ReconciliationTests): an edit of its amount, date, account, type or refund flag is refused on that field, and
 * deleting it answers 409 `transaction-reconciled`. A transfer either of whose legs is reconciled is locked the
 * same way, and is neither marked from a reconciled transaction nor unmarked.
 *
 * A deleted transaction is recently deleted (see the API's RecentlyDeletedTests) for 30 days, listed the last deleted
 * first, each leg of a transfer on its own; restoring one puts it back in the list and its account's balance, and
 * restoring a leg restores the whole transfer. One not deleted, or deleted longer ago, is not found.
 *
 * Tags (see the API's TagTests) are names kept trimmed and in lower case, each once and in order; a transaction
 * takes at most 20, each of 1 to 50 characters, refused as `tags`. A name the user has no tag with creates one,
 * which stays once no transaction has it. `tag` narrows the list to the transactions with it, in any case, and
 * `/api/v1/tags` lists the user's tags by name, those containing `q`, a page at a time.
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
        tags: [],
        isReconciled: false,
        ...transaction,
        categoryId,
      }
    }),
    /** The user's tags, by name: those of the seeded transactions and every one created since. */
    tags: [] as string[],
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
    /** Every POST and PUT body sent to the transfer endpoints, in the order they arrived. */
    transferRequests: [] as { method: string; body: Partial<TransferRequest> }[],
    /** Every body sent to mark two transactions as a transfer, in the order they arrived. */
    markRequests: [] as Partial<MarkRequest>[],
    /** Every body sent to unmark a transfer, with the transfer's id, in the order they arrived. */
    unmarkRequests: [] as { id: string; body: Partial<UnmarkRequest> }[],
    /**
     * Holds every answer to a request that changes something until the returned function is called, so a
     * test can look at the screen while the API has not answered yet.
     */
    hold() {
      let release!: () => void
      held = new Promise<void>((resolve) => (release = resolve))
      return release
    },
    /** The transactions deleted, each with when, the last deleted last: `deletedAt` can be set back to make one older. */
    deleted: [] as (Transaction & { deletedAt: string })[],
    /** The next request that changes something fails with a 500, having saved nothing. */
    failNext() {
      failing = true
    },
  }
  state.transactions.forEach(keepTags)
  let held: Promise<void> | undefined
  let heldLists: Promise<void> | undefined
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
    check('type', (value) => ['income', 'expense', 'transferOut', 'transferIn'].includes(value), 'Choose one of: income, expense, transferOut, transferIn.')
    check('min', isAmount, 'Enter an amount that is not negative, such as 125000.00.')
    check('max', isAmount, 'Enter an amount that is not negative, such as 125000.00.')
    check('q', (value) => value.trim().length <= 200, 'Search for at most 200 characters.')
    check('tag', (value) => value.trim().length <= 50, 'Send a tag of at most 50 characters.')
    check('sort', (value) => value === 'date' || value === 'amount', 'Choose one of: date, amount.')
    check('order', (value) => value === 'asc' || value === 'desc', 'Choose one of: asc, desc.')
    return errors
  }

  /** Whether a line is on the category or one of its subcategories. */
  const lineIn = (line: Transaction['lines'][number], id: string) =>
    line.categoryId === id || categories.find((category) => category.id === line.categoryId)?.parentId === id

  /** Whether a transaction passes every filter sent: both ends of a range included, a category with its subcategories through any line of a split, the search anywhere in the payee, the note or a line's note. */
  function passes(query: URLSearchParams) {
    const filter = (name: string) => query.get(name) ?? undefined
    const search = filter('q')?.trim().toLowerCase()
    const inCategory = (transaction: Transaction, id: string) => transaction.lines.some((line) => lineIn(line, id))
    return (transaction: Transaction) =>
      (filter('from') === undefined || transaction.date >= filter('from')!) &&
      (filter('to') === undefined || transaction.date <= filter('to')!) &&
      (filter('accountId') === undefined || transaction.accountId === filter('accountId')) &&
      (filter('categoryId') === undefined || inCategory(transaction, filter('categoryId')!)) &&
      (filter('type') === undefined || transaction.type === filter('type')) &&
      (filter('min') === undefined || Number(transaction.amount) >= Number(filter('min'))) &&
      (filter('max') === undefined || Number(transaction.amount) <= Number(filter('max'))) &&
      (!filter('tag')?.trim() || transaction.tags.includes(filter('tag')!.trim().toLowerCase())) &&
      (!search || [transaction.payee, transaction.note, ...transaction.lines.map((line) => line.note)].some((field) => field?.toLowerCase().includes(search)))
  }

  /**
   * What the transactions come to: how many, and income, expenses (minus refunds) and net in each currency, never
   * added across currencies. Filtered by a category, each adds only its lines in it, as spent does.
   */
  function totalOf(found: Transaction[], categoryId: string | null): TransactionList['total'] {
    const passing =
      categoryId === null
        ? found
        : found.map((transaction) => ({
            ...transaction,
            amount: text(transaction.lines.filter((line) => lineIn(line, categoryId)).reduce((total, line) => total + Number(line.amount), 0)),
          }))
    const sum = (of: Transaction[]) => text(of.reduce((total, transaction) => total + Number(transaction.amount), 0))
    return {
      count: passing.length,
      currencies: (Object.keys(decimals) as Transaction['currency'][])
        // A leg of a transfer is counted, and is neither income nor an expense.
        .map((currency) => passing.filter((transaction) => transaction.currency === currency && !transaction.transferId))
        .filter((inCurrency) => inCurrency.length > 0)
        .map((inCurrency) => ({
          currency: inCurrency[0]!.currency,
          income: sum(inCurrency.filter((transaction) => transaction.type === 'income')),
          expenses: text(inCurrency.filter((transaction) => transaction.type === 'expense').reduce((total, transaction) => total - signed(transaction), 0)),
          net: text(inCurrency.reduce((total, transaction) => total + signed(transaction), 0)),
        })),
      spent: categoryId === null ? null : spentOf(passing.filter((transaction) => transaction.type === 'expense')),
    }
  }

  /** What expenses, already cut to their lines in a category, spent in the base currency: refunds take away. */
  function spentOf(expenses: Transaction[]): NonNullable<TransactionList['total']['spent']> {
    const converted = expenses.filter((expense) => expense.currency === 'VND')
    return {
      currency: 'VND',
      amount: text(converted.reduce((total, expense) => total - signed(expense), 0)),
      notConverted: expenses.length - converted.length,
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
    const tags = tagNames(body.tags)
    if (body.tags?.some((tag) => !tag?.trim() || tag.trim().length > 50)) errors.tags = ['Enter tags of 1 to 50 characters.']
    else if (tags.length > 20) errors.tags = ['Give a transaction at most 20 tags.']
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
        tags,
      },
    }
  }

  /** Tag names as they are kept: trimmed, in lower case, each once, in order. */
  function tagNames(names: (string | null)[] | null | undefined) {
    return [...new Set((names ?? []).flatMap((name) => (name?.trim() ? [name.trim().toLowerCase()] : [])))].toSorted()
  }

  /** Creates the tags a saved transaction has that the user had none of yet. */
  function keepTags(transaction: Transaction) {
    state.tags = [...new Set([...state.tags, ...transaction.tags])].toSorted()
  }

  /** What a reconciled transaction keeps as it is; the API names the first one changed. */
  const lockedFields = ['amount', 'date', 'accountId', 'type', 'isRefund'] as const
  const reconciled = () => problem(409, { type: 'urn:pfm:problem:transaction-reconciled' })

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
      isReconciled: out.isReconciled || into.isReconciled,
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

    const shared = { date: body.date!, categoryId: null, payee: null, note: body.note?.trim() || null, isRefund: false, lines: [], recurringRuleId: null, tags: [] }
    return {
      out: { ...shared, accountId: from.id, amount: text(Number(body.amount)), currency: from.currency },
      into: { ...shared, accountId: to.id, amount: text(Number(toAmount)), currency: to.currency },
    }
  }

  const answerTransfer = (transfer: Transfer, status = 200) => HttpResponse.json(transfer, { status, headers: { ETag: `"${transfer.rowVersion}"` } })

  function removeTransfer(transferId: unknown) {
    for (const leg of legsOf(transferId)) remove(leg)
  }

  /** Deletes a transaction: it leaves the list and its account's balance, and is recently deleted. */
  function remove(transaction: Transaction) {
    move(transaction, -1)
    state.transactions.splice(state.transactions.indexOf(transaction), 1)
    state.deleted.push({ ...transaction, deletedAt: new Date().toISOString() })
  }

  const recoveryPeriod = 30 * 24 * 60 * 60 * 1000
  const restorableUntil = (deleted: { deletedAt: string }) => new Date(Date.parse(deleted.deletedAt) + recoveryPeriod)
  const recentlyDeleted = () => state.deleted.filter((deleted) => restorableUntil(deleted).getTime() > Date.now())

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
      return HttpResponse.json({ items, nextCursor: start + limit < sorted.length ? items.at(-1)!.id : null, total: totalOf(passing, query.get('categoryId')) })
    }),
    // Before the handler for one transaction, which would take "deleted" for an id.
    http.get(apiUrl('/api/v1/transactions/deleted'), ({ request }) => {
      const query = new URL(request.url).searchParams
      const limit = Number(query.get('limit') ?? 50)
      // The last deleted first; the real cursor is opaque, this one is the id of the page's last transaction.
      const lastFirst = recentlyDeleted().toReversed()
      const cursor = query.get('cursor')
      const start = cursor === null ? 0 : lastFirst.findIndex((deleted) => deleted.id === cursor) + 1
      if (cursor !== null && start === 0) return problem(400, { errors: { cursor: ['Use the nextCursor of the page before.'] } })
      const items = lastFirst.slice(start, start + limit).map(
        ({ id, type, accountId, amount, currency, date, categoryId, payee, note, transferId, isRefund, lines, deletedAt }): DeletedTransaction => ({
          ...{ id, type, accountId, amount, currency, date, categoryId, payee, note, transferId, isRefund, lines, deletedAt },
          restorableUntil: restorableUntil({ deletedAt }).toISOString(),
        }),
      )
      return HttpResponse.json({ items, nextCursor: start + limit < lastFirst.length ? items.at(-1)!.id : null })
    }),
    http.post(apiUrl('/api/v1/transactions/:id/restore'), async ({ request, params }) => {
      const stopped = await refusedOrFailed(request)
      if (stopped) return stopped
      const found = recentlyDeleted().find((deleted) => deleted.id === params.id)
      if (!found) return problem(404)
      // A leg restores the whole transfer.
      const restoring = found.transferId ? state.deleted.filter((deleted) => deleted.transferId === found.transferId) : [found]
      for (const deleted of restoring) {
        state.deleted.splice(state.deleted.indexOf(deleted), 1)
        const restored: Transaction = { ...deleted, rowVersion: String(Number(deleted.rowVersion) + 1) }
        delete (restored as Partial<typeof deleted>).deletedAt
        state.transactions.push(restored)
        move(restored, 1)
      }
      const restored = find(found.id)!
      return HttpResponse.json(restored, { headers: { ETag: `"${restored.rowVersion}"` } })
    }),
    http.get(apiUrl('/api/v1/tags'), ({ request }) => {
      const query = new URL(request.url).searchParams
      const search = query.get('q')?.trim().toLowerCase() ?? ''
      const limit = Number(query.get('limit') ?? 50)
      const matching = state.tags.filter((name) => name.includes(search))
      // The real cursor is opaque; this one is the name of the page's last tag.
      const cursor = query.get('cursor')
      const start = cursor === null ? 0 : matching.indexOf(cursor) + 1
      const items = matching.slice(start, start + limit)
      return HttpResponse.json({
        items: items.map((name) => ({ id: `tag-${name}`, name })),
        nextCursor: start + limit < matching.length ? items.at(-1)! : null,
      })
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
        // A refund says nothing about what a payee is for; each line of a split is a use of its category.
        if (!payee || transaction.payee?.toLowerCase() !== payee || (type && transaction.type !== type) || transaction.isRefund) continue
        for (const line of transaction.lines) {
          const category = categories.find((candidate) => candidate.id === line.categoryId)
          if (!category || category.isArchived) continue
          times.set(category.id, (times.get(category.id) ?? 0) + 1)
        }
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
        isReconciled: false,
        ...result.fields,
      }
      state.transactions.push(created)
      keepTags(created)
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
      if (found.isReconciled) {
        const asked = (await request.clone().json()) as Partial<TransactionRequest>
        const changed = lockedFields.find((field) =>
          field === 'amount' ? Number(asked.amount) !== Number(found.amount) : field === 'isRefund' ? (asked.isRefund ?? false) !== found.isRefund : asked[field] !== found[field],
        )
        if (changed) return problem(400, { errors: { [changed]: ['This transaction is reconciled.'] } })
      }
      const result = await validated(request, found)
      if (result.refused) return result.refused
      move(found, -1)
      Object.assign(found, result.fields, { rowVersion: String(Number(found.rowVersion) + 1) })
      keepTags(found)
      move(found, 1)
      return HttpResponse.json(found, { headers: { ETag: `"${found.rowVersion}"` } })
    }),
    http.delete(apiUrl('/api/v1/transactions/:id'), async ({ request, params }) => {
      const stopped = await refusedOrFailed(request)
      if (stopped) return stopped
      const found = find(params.id)
      if (!found) return problem(404)
      if (found.transferId ? legsOf(found.transferId).some((leg) => leg.isReconciled) : found.isReconciled) return reconciled()
      if (found.transferId) {
        removeTransfer(found.transferId)
        return new HttpResponse(null, { status: 204 })
      }
      remove(found)
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
        isReconciled: false,
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
    // Before the handlers for one transfer, which would take "mark" for an id.
    http.post(apiUrl('/api/v1/transfers/mark'), async ({ request }) => {
      const stopped = await refusedOrFailed(request)
      if (stopped) return stopped
      const body = (await request.json()) as Partial<MarkRequest>
      state.markRequests.push(body)
      const invalid = (field: string, message: string) => problem(400, { errors: { [field]: [message] } })
      const expense = find(body.expenseId)
      const income = find(body.incomeId)
      if (!expense) return invalid('expenseId', 'Choose one of your transactions.')
      if (!income) return invalid('incomeId', 'Choose one of your transactions.')
      if (expense.transferId) return invalid('expenseId', 'This is a leg of a transfer already.')
      if (expense.type !== 'expense' || expense.isRefund) return invalid('expenseId', 'Choose an expense that is not a refund: the money that left one account.')
      if (expense.isReconciled) return invalid('expenseId', 'This transaction is reconciled.')
      if (income.transferId) return invalid('incomeId', 'This is a leg of a transfer already.')
      if (income.isReconciled) return invalid('incomeId', 'This transaction is reconciled.')
      if (income.type !== 'income') return invalid('incomeId', 'Choose income: the money that arrived on the other account.')
      if (expense.accountId === income.accountId) return invalid('incomeId', 'A transfer is between two different accounts.')
      if (expense.currency === income.currency && Number(expense.amount) !== Number(income.amount)) {
        return invalid('incomeId', 'Accounts in the same currency move the same amount.')
      }
      if (expense.date !== income.date) return invalid('incomeId', 'The two legs of a transfer are on the same date.')

      // Each keeps its id, account, amount, date and note; the balances do not move.
      const transferId = `01970000-0000-7000-8000-5${String(recorded++).padStart(11, '0')}`
      for (const [leg, type] of [[expense, 'transferOut'], [income, 'transferIn']] as const) {
        Object.assign(leg, { type, transferId, categoryId: null, payee: null, recurringRuleId: null, lines: [], rowVersion: String(Number(leg.rowVersion) + 1) })
      }
      return answerTransfer(transferOf(transferId)!, 201)
    }),
    http.post(apiUrl('/api/v1/transfers/:id/unmark'), async ({ request, params }) => {
      const stopped = await refusedOrFailed(request)
      if (stopped) return stopped
      const body = (await request.json()) as Partial<UnmarkRequest>
      state.unmarkRequests.push({ id: String(params.id), body })
      const transfer = transferOf(params.id)
      if (!transfer) return problem(404)
      if (transfer.isReconciled) return problem(400, { errors: { id: ['This transfer is reconciled.'] } })
      const categoryOf = (id: unknown, kind: FakeCategory['kind']) =>
        categories.find((category) => category.id === id && category.kind === kind && !category.isArchived)
      const spentOn = categoryOf(body.expenseCategoryId, 'expense')
      if (!spentOn) return problem(400, { errors: { expenseCategoryId: ['Choose one of your categories that is not archived.'] } })
      const earnedOn = categoryOf(body.incomeCategoryId, 'income')
      if (!earnedOn) return problem(400, { errors: { incomeCategoryId: ['Choose one of your categories that is not archived.'] } })

      const [out, into] = [find(transfer.outTransactionId)!, find(transfer.inTransactionId)!]
      for (const [leg, type, category] of [[out, 'expense', spentOn], [into, 'income', earnedOn]] as const) {
        Object.assign(leg, {
          type,
          transferId: null,
          categoryId: category.id,
          lines: [{ categoryId: category.id, amount: leg.amount, note: null }],
          rowVersion: String(Number(leg.rowVersion) + 1),
        })
      }
      return HttpResponse.json({ expense: out, income: into })
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
      if (legsOf(params.id).some((leg) => leg.isReconciled)) return reconciled()
      removeTransfer(params.id)
      return new HttpResponse(null, { status: 204 })
    }),
  )

  // A transaction's drawer loads its attachments: none, unless a test sets up `fakeAttachmentsApi` itself afterwards.
  fakeAttachmentsApi([], { transactions: state.transactions })

  return state
}
