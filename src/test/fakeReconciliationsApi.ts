import { http, HttpResponse } from 'msw'
import type { components } from '@/shared/api/schema'
import { apiUrl, problem, refuseWithoutToken, server } from './server'

type Reconciliation = components['schemas']['ReconciliationResponse']
type Transaction = components['schemas']['TransactionResponse']
type Account = components['schemas']['AccountResponse']
type StartRequest = components['schemas']['StartReconciliationRequest']

/** An amount as the API writes it: at least two decimals. Test amounts are small, so a number holds them. */
const text = (amount: number) => amount.toFixed(2)

type Options = {
  /** The accounts reconciled, as `fakeAccountsApi` keeps them: a reconciliation starts from the opening balance. */
  accounts: Account[]
  /** The transactions ticked, as `fakeTransactionsApi` keeps them: completing locks them (`isReconciled`). */
  transactions: Transaction[]
  /** Today's date for the user; a statement dated after it is refused. */
  today?: string
}

/**
 * A stand-in for the API's reconciliation endpoints, keeping state across requests and following the same
 * rules as the real API (see the API's ReconciliationTests): an account has one reconciliation in progress at a
 * time (409 `reconciliation-in-progress`); a statement is not dated in the future; the transactions to tick are
 * the account's own dated on or before the statement date that no other reconciliation holds; the difference is
 * the statement balance less the reconciled balance (the opening balance and what other reconciliations hold)
 * and what is ticked; completing needs a difference of exactly zero (409 `reconciliation-difference-not-zero`)
 * and locks what is ticked; a completed one takes no ticks and cannot be cancelled (409
 * `reconciliation-completed`) until it is reopened, which unlocks its transactions.
 */
export function fakeReconciliationsApi({ accounts, transactions, today = '2026-11-20' }: Options) {
  type Kept = { id: string; accountId: string; statementDate: string; statementBalance: string; completedAt: string | null; ticked: Set<string> }
  let started = 0
  const state = {
    reconciliations: [] as Kept[],
    /** Every body sent to start one, in the order they arrived. */
    startRequests: [] as Partial<StartRequest>[],
  }

  const find = (id: unknown) => state.reconciliations.find((reconciliation) => reconciliation.id === id)
  const signed = (transaction: Transaction) =>
    (transaction.type === 'income' || transaction.type === 'transferIn' || transaction.isRefund ? 1 : -1) * Number(transaction.amount)
  const holding = (reconciliation: Kept) => transactions.filter((transaction) => reconciliation.ticked.has(transaction.id))

  function answer(reconciliation: Kept): Reconciliation {
    const account = accounts.find((candidate) => candidate.id === reconciliation.accountId)!
    const others = state.reconciliations.filter((other) => other.accountId === reconciliation.accountId && other !== reconciliation && other.completedAt)
    const reconciledBalance = Number(account.openingBalance) + others.flatMap(holding).reduce((sum, transaction) => sum + signed(transaction), 0)
    const ticked = holding(reconciliation)
    const tickedTotal = ticked.reduce((sum, transaction) => sum + signed(transaction), 0)
    return {
      id: reconciliation.id,
      accountId: reconciliation.accountId,
      statementDate: reconciliation.statementDate,
      statementBalance: reconciliation.statementBalance,
      currency: account.currency,
      status: reconciliation.completedAt ? 'completed' : 'inProgress',
      completedAt: reconciliation.completedAt,
      reconciledBalance: text(reconciledBalance),
      tickedTotal: text(tickedTotal),
      difference: text(Number(reconciliation.statementBalance) - reconciledBalance - tickedTotal),
      tickedCount: ticked.length,
    }
  }

  const held = (transaction: Transaction) => state.reconciliations.some((reconciliation) => reconciliation.ticked.has(transaction.id))
  const completed = () => problem(409, { type: 'urn:pfm:problem:reconciliation-completed' })

  server.use(
    http.post(apiUrl('/api/v1/accounts/:accountId/reconciliations'), async ({ request, params }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const body = (await request.json()) as Partial<StartRequest>
      state.startRequests.push(body)
      if (!accounts.some((account) => account.id === params.accountId)) return problem(404)
      const errors: Record<string, string[]> = {}
      if (!body.statementDate || body.statementDate > today) errors.statementDate = ['Enter a statement date that is not in the future.']
      if (!body.statementBalance || Number.isNaN(Number(body.statementBalance))) errors.statementBalance = ['Enter the balance as a decimal number.']
      if (Object.keys(errors).length > 0) return problem(400, { errors })
      if (state.reconciliations.some((reconciliation) => reconciliation.accountId === params.accountId && !reconciliation.completedAt)) {
        return problem(409, { type: 'urn:pfm:problem:reconciliation-in-progress' })
      }
      const reconciliation: Kept = {
        id: `01970000-0000-7000-8000-6${String(started++).padStart(11, '0')}`,
        accountId: String(params.accountId),
        statementDate: body.statementDate!,
        statementBalance: text(Number(body.statementBalance)),
        completedAt: null,
        ticked: new Set(),
      }
      state.reconciliations.push(reconciliation)
      return HttpResponse.json(answer(reconciliation), { status: 201 })
    }),
    http.get(apiUrl('/api/v1/accounts/:accountId/reconciliations'), ({ params }) => {
      if (!accounts.some((account) => account.id === params.accountId)) return problem(404)
      // The last started first.
      const items = state.reconciliations.filter((reconciliation) => reconciliation.accountId === params.accountId).toReversed().map(answer)
      return HttpResponse.json({ items, nextCursor: null })
    }),
    http.get(apiUrl('/api/v1/reconciliations/:id'), ({ params }) => {
      const reconciliation = find(params.id)
      return reconciliation ? HttpResponse.json(answer(reconciliation)) : problem(404)
    }),
    http.get(apiUrl('/api/v1/reconciliations/:id/transactions'), ({ params }) => {
      const reconciliation = find(params.id)
      if (!reconciliation) return problem(404)
      const listed = transactions
        .filter((transaction) =>
          reconciliation.ticked.has(transaction.id) ||
          (!reconciliation.completedAt && transaction.accountId === reconciliation.accountId && transaction.date <= reconciliation.statementDate && !held(transaction)),
        )
        .toSorted((a, b) => a.date.localeCompare(b.date))
        .map((transaction) => ({
          id: transaction.id,
          type: transaction.type,
          date: transaction.date,
          amount: transaction.amount,
          currency: transaction.currency,
          isRefund: transaction.isRefund,
          payee: transaction.payee,
          note: transaction.note,
          categoryId: transaction.categoryId,
          transferId: transaction.transferId,
          isTicked: reconciliation.ticked.has(transaction.id),
        }))
      return HttpResponse.json({ items: listed })
    }),
    http.put(apiUrl('/api/v1/reconciliations/:id/transactions/:transactionId'), ({ request, params }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const reconciliation = find(params.id)
      const transaction = transactions.find((candidate) => candidate.id === params.transactionId)
      if (!reconciliation || !transaction) return problem(404)
      if (reconciliation.completedAt) return completed()
      if (!reconciliation.ticked.has(transaction.id)) {
        if (transaction.accountId !== reconciliation.accountId || transaction.date > reconciliation.statementDate || held(transaction)) {
          return problem(400, { errors: { transactionId: ['This transaction cannot be ticked here.'] } })
        }
        reconciliation.ticked.add(transaction.id)
      }
      return HttpResponse.json(answer(reconciliation))
    }),
    http.delete(apiUrl('/api/v1/reconciliations/:id/transactions/:transactionId'), ({ request, params }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const reconciliation = find(params.id)
      if (!reconciliation || !transactions.some((candidate) => candidate.id === params.transactionId)) return problem(404)
      if (reconciliation.completedAt) return completed()
      reconciliation.ticked.delete(String(params.transactionId))
      return HttpResponse.json(answer(reconciliation))
    }),
    http.post(apiUrl('/api/v1/reconciliations/:id/complete'), ({ request, params }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const reconciliation = find(params.id)
      if (!reconciliation) return problem(404)
      if (!reconciliation.completedAt) {
        if (Number(answer(reconciliation).difference) !== 0) return problem(409, { type: 'urn:pfm:problem:reconciliation-difference-not-zero' })
        reconciliation.completedAt = '2026-11-20T09:00:00+00:00'
        for (const transaction of holding(reconciliation)) transaction.isReconciled = true
      }
      return HttpResponse.json(answer(reconciliation))
    }),
    http.post(apiUrl('/api/v1/reconciliations/:id/reopen'), ({ request, params }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const reconciliation = find(params.id)
      if (!reconciliation) return problem(404)
      const latest = state.reconciliations.findLast((other) => other.accountId === reconciliation.accountId)
      if (latest !== reconciliation) return problem(409, { type: 'urn:pfm:problem:reconciliation-not-latest' })
      reconciliation.completedAt = null
      for (const transaction of holding(reconciliation)) transaction.isReconciled = false
      return HttpResponse.json(answer(reconciliation))
    }),
    http.delete(apiUrl('/api/v1/reconciliations/:id'), ({ request, params }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const reconciliation = find(params.id)
      if (!reconciliation) return problem(404)
      if (reconciliation.completedAt) return completed()
      state.reconciliations.splice(state.reconciliations.indexOf(reconciliation), 1)
      return new HttpResponse(null, { status: 204 })
    }),
  )

  return state
}
