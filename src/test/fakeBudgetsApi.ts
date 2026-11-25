import { http, HttpResponse } from 'msw'
import type { components } from '@/shared/api/schema'
import { defaultTestCategories, type FakeCategory } from './fakeCategoriesApi'
import { apiUrl as url, problem, refuseWithoutToken, server, testUser } from './server'

type BudgetResponse = components['schemas']['BudgetResponse']
type BudgetMonthResponse = components['schemas']['BudgetMonthResponse']
type ProfileResponse = components['schemas']['ProfileResponse']
type CopiedBudgetsResponse = components['schemas']['CopiedBudgetsResponse']

/** A budget as the fake keeps it: what was spent against it is worked out each time it is asked for. */
export type FakeBudget = { month: string; categoryId: string; amount: string; rowVersion: string }

/** What was spent in one category itself, not counting its subcategories, in one budget month. */
type Spending = { spent: string; notConverted?: number }

type Options = {
  /** The user's categories: pass the state of `fakeCategoriesApi` to share them with it. */
  categories?: FakeCategory[]
  /** The user's profile: pass the state of `fakeProfileApi` to share it, so the first budget locks its base currency. */
  profile?: { profile: ProfileResponse }
  budgets?: Omit<FakeBudget, 'rowVersion'>[]
  /** By budget month, then category id. */
  spending?: Record<string, Record<string, Spending>>
}

/**
 * A stand-in for the API's budget endpoints, keeping state across requests and following the same rules as
 * the real API (see the API's BudgetTests): only an expense category takes a budget, a parent and its
 * subcategory never both have one in a month, spending in a subcategory counts toward a budget on its parent,
 * a change of amount must name the row version in `If-Match` (412 when stale, 428 when missing), the
 * first budget locks the base currency, and copying a month leaves alone every category that takes no new
 * budget in it (already budgeted, archived, or its parent or a subcategory budgeted). A test fake may do arithmetic on amounts; the app never does.
 */
export function fakeBudgetsApi({ categories = defaultTestCategories, profile = { profile: { ...testUser } }, budgets = [], spending = {} }: Options = {}) {
  const state = {
    budgets: budgets.map((budget): FakeBudget => ({ ...budget, rowVersion: '1' })),
    /** Every change sent, in the order they arrived. */
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
  profile.profile.baseCurrencyLocked = state.budgets.length > 0

  const invalid = (field: string, message: string) => problem(400, { errors: { [field]: [message] } })
  const isMonth = (month: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
  const text = (amount: number) => amount.toFixed(2)
  const find = (month: string, categoryId: string) => state.budgets.find((budget) => budget.month === month && budget.categoryId === categoryId)
  const family = (categoryId: string) => [categoryId, ...categories.filter((category) => category.parentId === categoryId).map((category) => category.id)]

  const view = (budget: FakeBudget): BudgetResponse => {
    const category = categories.find((each) => each.id === budget.categoryId)!
    const counted = family(category.id).map((id) => spending[budget.month]?.[id]).filter((each) => each !== undefined)
    const budgeted = Number(budget.amount)
    const spent = counted.reduce((sum, each) => sum + Number(each.spent), 0)
    const warningPercent = Number(profile.profile.budgetWarningPercent)
    return {
      categoryId: category.id,
      category: { id: category.id, parentId: category.parentId, name: category.name, icon: category.icon, color: category.color, isArchived: category.isArchived },
      budgeted: text(budgeted),
      spent: text(spent),
      remaining: text(budgeted - spent),
      percentSpent: budgeted === 0 ? null : Math.floor((spent * 100) / budgeted),
      state: spent > budgeted ? 'over' : budgeted > 0 && spent * 100 >= budgeted * warningPercent ? 'warning' : 'onTrack',
      notConverted: counted.reduce((sum, each) => sum + (each.notConverted ?? 0), 0),
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
    }
  }

  server.use(
    http.get(url('/api/v1/budgets'), ({ request }) => {
      const month = new URL(request.url).searchParams.get('month')
      state.monthsRead.push(month)
      if (month !== null && !isMonth(month)) return invalid('month', 'Enter a month as YYYY-MM.')
      return HttpResponse.json(monthView(month ?? state.currentMonth))
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
      const amount = profile.profile.baseCurrency === 'VND' ? /^[0-9]{1,15}(\.0+)?$/ : /^[0-9]{1,15}(\.[0-9]{1,2}0*)?$/
      if (!amount.test(body.amount ?? '')) {
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
      profile.profile.baseCurrencyLocked = state.budgets.length > 0
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
      profile.profile.baseCurrencyLocked = state.budgets.length > 0
      return new HttpResponse(null, { status: 204 })
    }),
  )

  return state
}
