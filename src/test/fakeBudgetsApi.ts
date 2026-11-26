import { http, HttpResponse } from 'msw'
import type { components } from '@/shared/api/schema'
import { defaultTestCategories, type FakeCategory } from './fakeCategoriesApi'
import { apiUrl as url, problem, refuseWithoutToken, server, testUser } from './server'

type BudgetResponse = components['schemas']['BudgetResponse']
type BudgetMonthResponse = components['schemas']['BudgetMonthResponse']
type ProfileResponse = components['schemas']['ProfileResponse']
type CopiedBudgetsResponse = components['schemas']['CopiedBudgetsResponse']
type OverallBudgetResponse = components['schemas']['OverallBudgetResponse']
type BudgetPace = components['schemas']['BudgetPace']

/** A budget as the fake keeps it: what was spent against it is worked out each time it is asked for. */
export type FakeBudget = { month: string; categoryId: string; amount: string; rowVersion: string }

/** A month's overall budget as the fake keeps it. */
export type FakeOverallBudget = { month: string; amount: string; rowVersion: string }

/** What was spent in one category itself, not counting its subcategories, in one budget month. */
type Spending = { spent: string; notConverted?: number }

type Options = {
  /** The user's categories: pass the state of `fakeCategoriesApi` to share them with it. */
  categories?: FakeCategory[]
  /** The user's profile: pass the state of `fakeProfileApi` to share it, so the first budget locks its base currency. */
  profile?: { profile: ProfileResponse }
  budgets?: Omit<FakeBudget, 'rowVersion'>[]
  /** The overall budgets, by month. */
  overall?: Omit<FakeOverallBudget, 'rowVersion'>[]
  /** Today in the user's time zone, as `2026-11-15`: its month is the current one, whose budgets have a pace. Left out, no month has one. */
  today?: string
  /** By budget month, then category id. */
  spending?: Record<string, Record<string, Spending>>
}

/**
 * A stand-in for the API's budget endpoints, keeping state across requests and following the same rules as
 * the real API (see the API's BudgetTests): only an expense category takes a budget, a parent and its
 * subcategory never both have one in a month, spending in a subcategory counts toward a budget on its parent,
 * a change of amount must name the row version in `If-Match` (412 when stale, 428 when missing), the
 * first budget locks the base currency, and copying a month leaves alone every category that takes no new
 * budget in it (already budgeted, archived, or its parent or a subcategory budgeted). The overall budget counts
 * every category's spending, is copied when the month has none, and with every budget of the current month has a pace. A test fake may do arithmetic on amounts; the app never does.
 */
export function fakeBudgetsApi({
  categories = defaultTestCategories,
  profile = { profile: { ...testUser } },
  budgets = [],
  overall = [],
  today,
  spending = {},
}: Options = {}) {
  const state = {
    budgets: budgets.map((budget): FakeBudget => ({ ...budget, rowVersion: '1' })),
    overall: overall.map((budget): FakeOverallBudget => ({ ...budget, rowVersion: '1' })),
    /** Every change sent, in the order they arrived; `categoryId` is `overall` for the overall budget. */
    requests: [] as { method: string; month: string; categoryId: string; body?: unknown; ifMatch?: string | null }[],
    /** Every copy asked for, in the order they arrived. */
    copies: [] as { month: string; sourceMonth: string }[],
    /** Every month the list was asked for; null when it was asked for without one. */
    monthsRead: [] as (string | null)[],
    /** When set, every change is answered with this status instead of being made. */
    failWith: undefined as number | undefined,
    /** What "now" is for a list asked for without a month. */
    currentMonth: '2026-11',
  }
  const anyBudget = () => state.budgets.length + state.overall.length > 0
  profile.profile.baseCurrencyLocked = anyBudget()

  const invalid = (field: string, message: string) => problem(400, { errors: { [field]: [message] } })
  const isMonth = (month: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
  const text = (amount: number) => amount.toFixed(2)
  const find = (month: string, categoryId: string) => state.budgets.find((budget) => budget.month === month && budget.categoryId === categoryId)
  const amountPattern = () => (profile.profile.baseCurrency === 'VND' ? /^[0-9]{1,15}(\.0+)?$/ : /^[0-9]{1,15}(\.[0-9]{1,2}0*)?$/)
  const findOverall = (month: string) => state.overall.find((budget) => budget.month === month)

  /** Today's day and the days of the month, when the month is today's; null for any other. */
  const elapsed = (month: string) => {
    if (!today?.startsWith(month)) return null
    const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()
    return { day: Number(today.slice(8, 10)), days }
  }
  const paceOf = (month: string, budgeted: number, spent: number): BudgetPace => {
    const now = elapsed(month)
    if (!now) return null
    return spent * now.days > budgeted * now.day ? 'aheadOfPace' : 'onPace'
  }
  const progressOf = (month: string, budgeted: number, counted: Spending[]) => {
    const spent = counted.reduce((sum, each) => sum + Number(each.spent), 0)
    const warningPercent = Number(profile.profile.budgetWarningPercent)
    return {
      budgeted: text(budgeted),
      spent: text(spent),
      remaining: text(budgeted - spent),
      percentSpent: budgeted === 0 ? null : Math.floor((spent * 100) / budgeted),
      state: spent > budgeted ? 'over' : budgeted > 0 && spent * 100 >= budgeted * warningPercent ? 'warning' : 'onTrack',
      notConverted: counted.reduce((sum, each) => sum + (each.notConverted ?? 0), 0),
      pace: paceOf(month, budgeted, spent),
    } satisfies Partial<BudgetResponse>
  }

  const overallView = (budget: FakeOverallBudget): OverallBudgetResponse => ({
    ...progressOf(budget.month, Number(budget.amount), Object.values(spending[budget.month] ?? {})),
    rowVersion: budget.rowVersion,
  })

  const family = (categoryId: string) => [categoryId, ...categories.filter((category) => category.parentId === categoryId).map((category) => category.id)]

  const view = (budget: FakeBudget): BudgetResponse => {
    const category = categories.find((each) => each.id === budget.categoryId)!
    const counted = family(category.id).map((id) => spending[budget.month]?.[id]).filter((each) => each !== undefined)
    return {
      categoryId: category.id,
      category: { id: category.id, parentId: category.parentId, name: category.name, icon: category.icon, color: category.color, isArchived: category.isArchived },
      ...progressOf(budget.month, Number(budget.amount), counted),
      rowVersion: budget.rowVersion,
    }
  }

  const monthView = (month: string): BudgetMonthResponse => {
    const items = state.budgets.filter((budget) => budget.month === month).map(view)
    const total = (of: (budget: BudgetResponse) => string) => text(items.reduce((sum, budget) => sum + Number(of(budget)), 0))
    return {
      month,
      currency: profile.profile.baseCurrency,
      warningPercent: profile.profile.budgetWarningPercent,
      items,
      totals: {
        budgeted: total((budget) => budget.budgeted),
        spent: total((budget) => budget.spent),
        remaining: total((budget) => budget.remaining),
        notConverted: items.reduce((sum, budget) => sum + Number(budget.notConverted), 0),
      },
      overall: findOverall(month) ? overallView(findOverall(month)!) : null,
      percentOfMonthElapsed: elapsed(month) ? Math.floor((elapsed(month)!.day * 100) / elapsed(month)!.days) : null,
    }
  }

  server.use(
    http.get(url('/api/v1/budgets'), ({ request }) => {
      const month = new URL(request.url).searchParams.get('month')
      state.monthsRead.push(month)
      if (month !== null && !isMonth(month)) return invalid('month', 'Enter a month as YYYY-MM.')
      return HttpResponse.json(monthView(month ?? state.currentMonth))
    }),
    http.put(url('/api/v1/budgets/:month/overall'), async ({ request, params }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const month = String(params.month)
      const body = (await request.json()) as { amount?: string }
      const ifMatch = request.headers.get('If-Match')
      state.requests.push({ method: 'PUT', month, categoryId: 'overall', body, ifMatch })
      if (state.failWith) return problem(state.failWith)
      if (!isMonth(month)) return invalid('month', 'Enter a month as YYYY-MM.')
      if (!amountPattern().test(body.amount ?? '')) return invalid('amount', 'Enter an amount of zero or more.')
      const existing = findOverall(month)
      if (existing) {
        if (ifMatch === null) return problem(428)
        if (ifMatch !== `"${existing.rowVersion}"`) return problem(412)
        Object.assign(existing, { amount: body.amount, rowVersion: String(Number(existing.rowVersion) + 1) })
        return HttpResponse.json(overallView(existing), { headers: { ETag: `"${existing.rowVersion}"` } })
      }
      if (ifMatch !== null) return problem(412)
      const created: FakeOverallBudget = { month, amount: body.amount!, rowVersion: '1' }
      state.overall.push(created)
      profile.profile.baseCurrencyLocked = true
      return HttpResponse.json(overallView(created), { status: 201, headers: { ETag: '"1"' } })
    }),
    http.delete(url('/api/v1/budgets/:month/overall'), ({ request, params }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const month = String(params.month)
      state.requests.push({ method: 'DELETE', month, categoryId: 'overall' })
      if (state.failWith) return problem(state.failWith)
      const existing = findOverall(month)
      if (!existing) return problem(404)
      state.overall.splice(state.overall.indexOf(existing), 1)
      profile.profile.baseCurrencyLocked = anyBudget()
      return new HttpResponse(null, { status: 204 })
    }),
    http.put(url('/api/v1/budgets/:month/:categoryId'), async ({ request, params }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const month = String(params.month)
      const categoryId = String(params.categoryId)
      const body = (await request.json()) as { amount?: string }
      const ifMatch = request.headers.get('If-Match')
      state.requests.push({ method: 'PUT', month, categoryId, body, ifMatch })
      if (state.failWith) return problem(state.failWith)
      if (!isMonth(month)) return invalid('month', 'Enter a month as YYYY-MM.')
      if (!amountPattern().test(body.amount ?? '')) {
        return invalid('amount', 'Enter an amount of zero or more.')
      }
      const category = categories.find((each) => each.id === categoryId)
      if (!category) return problem(404)

      const existing = find(month, categoryId)
      if (existing) {
        if (ifMatch === null) return problem(428)
        if (ifMatch !== `"${existing.rowVersion}"`) return problem(412)
        Object.assign(existing, { amount: body.amount, rowVersion: String(Number(existing.rowVersion) + 1) })
        return HttpResponse.json(view(existing), { headers: { ETag: `"${existing.rowVersion}"` } })
      }

      if (ifMatch !== null) return problem(412)
      if (category.kind !== 'expense') return invalid('categoryId', 'Only an expense category takes a budget.')
      if (category.isArchived) return invalid('categoryId', 'An archived category takes no new budget.')
      if (category.parentId && find(month, category.parentId)) return invalid('categoryId', 'Its parent category already has a budget this month.')
      if (family(categoryId).slice(1).some((id) => find(month, id))) return invalid('categoryId', 'One of its subcategories already has a budget this month.')
      const created: FakeBudget = { month, categoryId, amount: body.amount!, rowVersion: '1' }
      state.budgets.push(created)
      profile.profile.baseCurrencyLocked = true
      return HttpResponse.json(view(created), { status: 201, headers: { ETag: '"1"' } })
    }),
    http.post(url('/api/v1/budgets/:month/copy-from/:sourceMonth'), ({ request, params }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const month = String(params.month)
      const sourceMonth = String(params.sourceMonth)
      state.copies.push({ month, sourceMonth })
      if (state.failWith) return problem(state.failWith)
      if (!isMonth(month)) return invalid('month', 'Enter a month as YYYY-MM.')
      if (!isMonth(sourceMonth) || sourceMonth === month) return invalid('sourceMonth', 'Copy from another month.')
      let copied = 0
      for (const source of state.budgets.filter((budget) => budget.month === sourceMonth)) {
        const category = categories.find((each) => each.id === source.categoryId)
        if (!category || category.isArchived || find(month, category.id)) continue
        if (category.parentId && find(month, category.parentId)) continue
        if (family(category.id).slice(1).some((id) => find(month, id))) continue
        state.budgets.push({ month, categoryId: category.id, amount: source.amount, rowVersion: '1' })
        copied++
      }
      const sourceOverall = findOverall(sourceMonth)
      if (sourceOverall && !findOverall(month)) {
        state.overall.push({ month, amount: sourceOverall.amount, rowVersion: '1' })
        copied++
      }
      profile.profile.baseCurrencyLocked = anyBudget()
      return HttpResponse.json({ copied } satisfies CopiedBudgetsResponse)
    }),
    http.delete(url('/api/v1/budgets/:month/:categoryId'), ({ request, params }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const month = String(params.month)
      const categoryId = String(params.categoryId)
      state.requests.push({ method: 'DELETE', month, categoryId })
      if (state.failWith) return problem(state.failWith)
      const existing = find(month, categoryId)
      if (!existing) return problem(404)
      state.budgets.splice(state.budgets.indexOf(existing), 1)
      profile.profile.baseCurrencyLocked = anyBudget()
      return new HttpResponse(null, { status: 204 })
    }),
  )

  return state
}
