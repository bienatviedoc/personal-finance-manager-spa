import { http, HttpResponse } from 'msw'
import type { components } from '@/shared/api/schema'
import type { FakeCategory } from './fakeCategoriesApi'
import { apiUrl, problem, refuseWithoutToken, server } from './server'

type RecurringRule = components['schemas']['RecurringRuleResponse']
type RecurringRuleRequest = components['schemas']['RecurringRuleRequest']
type Account = components['schemas']['AccountResponse']

const decimals: Record<string, number> = { VND: 0, USD: 2, EUR: 2 }
const frequencies = ['weekly', 'monthly', 'yearly', 'everyNDays']
const isDate = (text: unknown) => typeof text === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(text)

type Options = {
  /** The accounts rules post to, as `fakeAccountsApi` keeps them. */
  accounts: Account[]
  /** The categories rules take, as `fakeCategoriesApi` keeps them. */
  categories: FakeCategory[]
}

/**
 * A stand-in for the API's recurring rule endpoints, keeping state across requests and following the same
 * rules as the real API (see the API's RecurringRuleTests): the list is the last set up first, a page at a
 * time; a rule is income or an expense, never a transfer; its currency is its account's; the amount is above
 * zero with no more decimals than the currency has; income takes an income category and an expense an expense
 * category; archived accounts and categories take no new rules; only `everyNDays` takes an `interval`, of 1 to
 * 365; the end date is not before the start date; an edit must name the row version in `If-Match` (412 when
 * stale, 428 when missing), and pausing and resuming move it on too; pausing and resuming answer the rule; deleting removes it.
 * Nothing posts here, so a rule's next run date stays its start date.
 */
export function fakeRecurringRulesApi(rules: Partial<RecurringRule>[] = [], { accounts, categories }: Options) {
  let added = 0
  const state = {
    rules: rules.map((rule, index): RecurringRule => {
      const account = accounts.find((candidate) => candidate.id === rule.accountId) ?? accounts[0]
      const startDate = rule.startDate ?? '2026-12-05'
      return {
        id: `01970000-0000-7000-8000-5000000000${String(index).padStart(2, '0')}`,
        type: 'expense',
        accountId: account?.id ?? '',
        amount: '1.00',
        currency: account?.currency ?? 'VND',
        categoryId: categories.find((category) => category.kind === (rule.type ?? 'expense'))?.id ?? '',
        payee: null,
        note: null,
        frequency: 'monthly',
        interval: null,
        startDate,
        endDate: null,
        nextRunDate: startDate,
        isPaused: false,
        rowVersion: '1',
        ...rule,
      }
    }),
    /** Every request that changes something, in the order they arrived; a body where one was sent. */
    requests: [] as { method: string; path: string; body?: Partial<RecurringRuleRequest> }[],
    /** The `If-Match` header of every edit, in the order they arrived. */
    ifMatches: [] as (string | null)[],
    /** The next request that changes something fails with a 500, having saved nothing. */
    failNext() {
      failing = true
    },
  }
  let failing = false

  const find = (id: unknown) => state.rules.find((rule) => rule.id === id)

  async function validated(request: Request, current?: RecurringRule) {
    const body = (await request.json()) as Partial<RecurringRuleRequest>
    state.requests.push({ method: request.method, path: new URL(request.url).pathname, body })
    const errors: Record<string, string[]> = {}
    if (body.type !== 'income' && body.type !== 'expense') errors.type = ['Choose one of: income, expense.']
    if (!body.accountId) errors.accountId = ['This field is required.']
    if (!/^\d+(\.\d+)?$/.test(body.amount ?? '') || Number(body.amount) <= 0) errors.amount = ['Enter an amount greater than zero.']
    if (!body.categoryId) errors.categoryId = ['This field is required.']
    if ((body.payee?.trim().length ?? 0) > 200) errors.payee = ['Enter a payee of at most 200 characters.']
    if ((body.note?.trim().length ?? 0) > 1000) errors.note = ['Enter a note of at most 1000 characters.']
    const interval = body.interval ?? null
    if (!frequencies.includes(body.frequency ?? '')) errors.frequency = ['Choose a frequency.']
    else if (body.frequency === 'everyNDays' ? !(Number.isInteger(interval) && Number(interval) >= 1 && Number(interval) <= 365) : interval !== null) {
      errors.interval = ['Send how many days apart for everyNDays and leave it out for any other frequency.']
    }
    if (!isDate(body.startDate)) errors.startDate = ['Enter a date as YYYY-MM-DD.']
    const endDate = body.endDate ?? null
    if (endDate !== null && !isDate(endDate)) errors.endDate = ['Enter a date as YYYY-MM-DD.']
    else if (endDate !== null && isDate(body.startDate) && endDate < body.startDate!) errors.endDate = ['A recurring rule cannot end before it starts.']
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
    if (category.kind !== body.type) return invalid('categoryId', 'An income rule takes an income category.')

    return {
      fields: {
        type: body.type as RecurringRule['type'],
        accountId: account.id,
        amount: Number(body.amount).toFixed(2),
        currency: account.currency,
        categoryId: category.id,
        payee: body.payee?.trim() || null,
        note: body.note?.trim() || null,
        frequency: body.frequency as RecurringRule['frequency'],
        interval,
        startDate: body.startDate!,
        endDate,
        nextRunDate: body.startDate!,
      },
    }
  }

  /** What every request that changes something goes through first: the token, then a planned failure. */
  function refusedOrFailed(request: Request) {
    const refused = refuseWithoutToken(request)
    if (refused) return refused
    if (failing) {
      failing = false
      return problem(500)
    }
    return null
  }

  const setPaused = (isPaused: boolean) => ({ request, params }: { request: Request; params: Record<string, unknown> }) => {
    const stopped = refusedOrFailed(request)
    if (stopped) return stopped
    state.requests.push({ method: request.method, path: new URL(request.url).pathname })
    const found = find(params.id)
    if (!found) return problem(404)
    Object.assign(found, { isPaused, rowVersion: String(Number(found.rowVersion) + 1) })
    return HttpResponse.json(found, { headers: { ETag: `"${found.rowVersion}"` } })
  }

  server.use(
    http.get(apiUrl('/api/v1/recurring-rules'), ({ request }) => {
      const query = new URL(request.url).searchParams
      const limit = Number(query.get('limit') ?? 50)
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) return problem(400, { errors: { limit: ['Ask for 1 to 100 at a time.'] } })
      const newestFirst = state.rules.toReversed()
      // The real cursor is opaque; this one is the id of the page's last rule.
      const cursor = query.get('cursor')
      const start = cursor === null ? 0 : newestFirst.findIndex((rule) => rule.id === cursor) + 1
      if (cursor !== null && start === 0) return problem(400, { errors: { cursor: ['Use the nextCursor of the page before.'] } })
      const items = newestFirst.slice(start, start + limit)
      return HttpResponse.json({ items, nextCursor: start + limit < newestFirst.length ? items.at(-1)!.id : null })
    }),
    http.post(apiUrl('/api/v1/recurring-rules'), async ({ request }) => {
      const stopped = refusedOrFailed(request)
      if (stopped) return stopped
      const result = await validated(request)
      if (result.refused) return result.refused
      const created: RecurringRule = { id: `01970000-0000-7000-8000-6${String(added++).padStart(11, '0')}`, isPaused: false, rowVersion: '1', ...result.fields }
      state.rules.push(created)
      return HttpResponse.json(created, { status: 201, headers: { ETag: `"${created.rowVersion}"` } })
    }),
    http.put(apiUrl('/api/v1/recurring-rules/:id'), async ({ request, params }) => {
      const ifMatch = request.headers.get('If-Match')
      state.ifMatches.push(ifMatch)
      const stopped = refusedOrFailed(request)
      if (stopped) return stopped
      if (ifMatch === null) return problem(428)
      const found = find(params.id)
      if (!found) return problem(404)
      if (ifMatch !== `"${found.rowVersion}"`) return problem(412)
      const result = await validated(request, found)
      if (result.refused) return result.refused
      Object.assign(found, result.fields, { rowVersion: String(Number(found.rowVersion) + 1) })
      return HttpResponse.json(found, { headers: { ETag: `"${found.rowVersion}"` } })
    }),
    http.post(apiUrl('/api/v1/recurring-rules/:id/pause'), setPaused(true)),
    http.post(apiUrl('/api/v1/recurring-rules/:id/resume'), setPaused(false)),
    http.delete(apiUrl('/api/v1/recurring-rules/:id'), ({ request, params }) => {
      const stopped = refusedOrFailed(request)
      if (stopped) return stopped
      state.requests.push({ method: request.method, path: new URL(request.url).pathname })
      const found = find(params.id)
      if (!found) return problem(404)
      state.rules.splice(state.rules.indexOf(found), 1)
      return new HttpResponse(null, { status: 204 })
    }),
  )

  return state
}
