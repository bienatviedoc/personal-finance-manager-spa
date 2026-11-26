import { http, HttpResponse } from 'msw'
import type { components } from '@/shared/api/schema'
import type { FakeCategory } from './fakeCategoriesApi'
import { apiUrl, problem, refuseWithoutToken, server } from './server'

type RecurringRule = components['schemas']['RecurringRuleResponse']
type RecurringRuleRequest = components['schemas']['RecurringRuleRequest']
type Account = components['schemas']['AccountResponse']
type ConfirmReminderRequest = components['schemas']['ConfirmReminderRequest']
type Occurrence = components['schemas']['OccurrenceResponse']

const decimals: Record<string, number> = { VND: 0, USD: 2, EUR: 2 }
const frequencies = ['weekly', 'monthly', 'yearly', 'everyNDays']
const isDate = (text: unknown) => typeof text === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(text)

const isoDate = (date: Date) => date.toISOString().slice(0, 10)

function addDays(date: string, days: number) {
  const moved = new Date(`${date}T00:00:00Z`)
  moved.setUTCDate(moved.getUTCDate() + days)
  return isoDate(moved)
}

/** The date this many months after the start, on the start's day or the month's last day when it has fewer. */
function addMonths(start: string, months: number) {
  const [year, month, day] = start.split('-').map(Number) as [number, number, number]
  const lastDay = new Date(Date.UTC(year, month - 1 + months + 1, 0)).getUTCDate()
  return isoDate(new Date(Date.UTC(year, month - 1 + months, Math.min(day, lastDay))))
}

/** Every due date of the rule from its start to its end, worked out from the start date as the API does. */
function* dueDatesOf(rule: RecurringRule) {
  for (let n = 0; n < 10000; n++) {
    const date =
      rule.frequency === 'weekly' ? addDays(rule.startDate, 7 * n)
      : rule.frequency === 'everyNDays' ? addDays(rule.startDate, Number(rule.interval) * n)
      : addMonths(rule.startDate, (rule.frequency === 'yearly' ? 12 : 1) * n)
    if (rule.endDate !== null && date > rule.endDate) return
    yield date
  }
}

/** The rule's due dates not posted, confirmed, dismissed or skipped yet, up to and including `through`. */
function unsettledThrough(rule: RecurringRule, through: string) {
  const dates: string[] = []
  if (rule.isPaused || rule.nextRunDate === null) return dates
  for (const date of dueDatesOf(rule)) {
    if (date > through) break
    if (date >= rule.nextRunDate) dates.push(date)
  }
  return dates
}

/** Today in the test user's time zone. */
const todayInHoChiMinh = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

type Options = {
  /** The accounts rules post to, as `fakeAccountsApi` keeps them. */
  accounts: Account[]
  /** The categories rules take, as `fakeCategoriesApi` keeps them. */
  categories: FakeCategory[]
  /** Today for the user, `YYYY-MM-DD`; the test user's, in Ho Chi Minh City, when left out. */
  today?: string
}

/**
 * A stand-in for the API's recurring rule endpoints, keeping state across requests and following the same
 * rules as the real API (see the API's RecurringRuleTests): the list is the last set up first, a page at a
 * time; a rule is income or an expense, never a transfer; its currency is its account's; the amount is above
 * zero with no more decimals than the currency has; income takes an income category and an expense an expense
 * category; archived accounts and categories take no new rules; only `everyNDays` takes an `interval`, of 1 to
 * 365; the end date is not before the start date; an edit must name the row version in `If-Match` (412 when
 * stale, 428 when missing), and pausing and resuming move it on too; pausing and resuming answer the rule; deleting removes it.
 * Nothing posts here, so a rule's next run date stays its start date. A rule that reminds has a reminder for
 * each occurrence due by today; confirming or dismissing one moves the rule on, earliest first (400 on
 * `dueDate` otherwise), and confirming records nothing here: it only answers the rule.
 */
export function fakeRecurringRulesApi(rules: Partial<RecurringRule>[] = [], { accounts, categories, today = todayInHoChiMinh() }: Options) {
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
        mode: 'autoPost',
        rowVersion: '1',
        ...rule,
      }
    }),
    /** Every request that changes something, in the order they arrived; a body where one was sent. */
    requests: [] as { method: string; path: string; body?: Partial<RecurringRuleRequest> | Partial<ConfirmReminderRequest> }[],
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
    if (body.mode != null && body.mode !== 'autoPost' && body.mode !== 'remind') errors.mode = ['Choose one of: autoPost, remind, or leave it out to post each occurrence.']
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
        mode: (body.mode ?? 'autoPost') as RecurringRule['mode'],
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

  const occurrence = (rule: RecurringRule, dueDate: string): Occurrence => ({
    recurringRuleId: rule.id, dueDate, type: rule.type, accountId: rule.accountId, amount: rule.amount, currency: rule.currency,
    categoryId: rule.categoryId, payee: rule.payee, note: rule.note, mode: rule.mode,
  })
  const byDueDate = (a: Occurrence, b: Occurrence) => a.dueDate.localeCompare(b.dueDate) || a.recurringRuleId.localeCompare(b.recurringRuleId)

  /** Confirming or dismissing a reminder: the rule, refused or moved on to its next occurrence. */
  const answerReminder = (confirming: boolean) => async ({ request, params }: { request: Request; params: Record<string, unknown> }) => {
    const stopped = refusedOrFailed(request)
    if (stopped) return stopped
    const path = new URL(request.url).pathname
    const body = confirming ? ((await request.json()) as Partial<ConfirmReminderRequest>) : undefined
    state.requests.push(confirming ? { method: request.method, path, body } : { method: request.method, path })
    const dueDate = String(params.dueDate)
    if (!isDate(dueDate)) return problem(400, { errors: { dueDate: ['Enter a date as YYYY-MM-DD.'] } })
    if (body?.amount != null && !(/^\d+(\.\d+)?$/.test(body.amount) && Number(body.amount) > 0)) {
      return problem(400, { errors: { amount: ['Enter an amount greater than zero.'] } })
    }
    const found = find(params.id)
    if (!found || found.mode !== 'remind' || !unsettledThrough(found, today).includes(dueDate)) return problem(404)
    if (dueDate !== found.nextRunDate) return problem(400, { errors: { dueDate: [`Confirm or dismiss the reminder due on ${found.nextRunDate} first.`] } })
    const next = unsettledThrough(found, '9999-12-31').find((date) => date > dueDate)
    Object.assign(found, { nextRunDate: next ?? null, rowVersion: String(Number(found.rowVersion) + 1) })
    return HttpResponse.json(found, { headers: { ETag: `"${found.rowVersion}"` } })
  }

  server.use(
    http.get(apiUrl('/api/v1/recurring-rules/reminders'), () => {
      const items = state.rules
        .filter((rule) => rule.mode === 'remind')
        .flatMap((rule) => unsettledThrough(rule, today).map((dueDate) => occurrence(rule, dueDate)))
      return HttpResponse.json({ items: items.sort(byDueDate) })
    }),
    http.post(apiUrl('/api/v1/recurring-rules/:id/reminders/:dueDate/confirm'), answerReminder(true)),
    http.post(apiUrl('/api/v1/recurring-rules/:id/reminders/:dueDate/dismiss'), answerReminder(false)),
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
