import { http, HttpResponse } from 'msw'
import type { components } from '@/shared/api/schema'
import { defaultTestCategories, type FakeCategory } from './fakeCategoriesApi'
import { apiUrl as url, problem, server, testUser } from './server'

type SpendingByCategoryResponse = components['schemas']['SpendingByCategoryResponse']
type SpendingTransactionsResponse = components['schemas']['SpendingTransactionsResponse']
type IncomeVsExpensesResponse = components['schemas']['IncomeVsExpensesResponse']
type NetWorthResponse = components['schemas']['NetWorthResponse']
type TrendResponse = components['schemas']['TrendResponse']
type TrendMonthResponse = components['schemas']['TrendMonthResponse']
type Currency = components['schemas']['Currency']
type BudgetVsActualResponse = components['schemas']['BudgetVsActualResponse']

/** One budget as the fake keeps it: an amount for one category in one budget month (`YYYY-MM`). */
export type FakeBudget = { month: string; categoryId: string; amount: string }

/**
 * One expense, or one line of a split expense, as the fake keeps it. The lines of a split share an `id` and
 * each has its own category and part. One in an income category is income received, for the trends report.
 */
export type FakeExpense = {
  id: string
  date: string
  categoryId: string
  accountId?: string
  /** What it adds to spent, in the base currency, negative for a refund; null while it is not converted. */
  spent: string | null
  /** In its own currency, as the user entered it; the same as spent when left out. */
  amount?: string
  currency?: Currency
  payee?: string | null
  note?: string | null
  isRefund?: boolean
}

/** One income, or one line of a split income, as the fake keeps it. */
export type FakeIncome = {
  id: string
  date: string
  categoryId: string
  accountId?: string
  /** What it brought in, in the base currency; null while it is not converted. */
  amount: string | null
}

/**
 * An account's balance from a day on, until a later holding of the same account, as net worth counts it: already
 * in the base currency. An account has no balance before its first holding, as before its opening date.
 */
export type FakeHolding = {
  accountId: string
  /** The first day the balance holds on. */
  from: string
  /** In the base currency, negative while something is owed; null while it is not converted. */
  balance: string | null
  /** A credit card or loan: a liability. */
  holdsAmountOwed?: boolean
}

type Options = {
  categories?: FakeCategory[]
  expenses?: FakeExpense[]
  income?: FakeIncome[]
  budgets?: FakeBudget[]
  holdings?: FakeHolding[]
  baseCurrency?: Currency
  /** The user's budget warning threshold, in percent. */
  warningPercent?: number
}

/** Every query the report and its transactions were asked with, in the order they arrived. */
type Asked = Record<string, string>

/**
 * A stand-in for the API's reports (net worth from `holdings`, see the API's NetWorthTests), and its spending by category report, following the same rules as the real API (see the API's
 * SpendingByCategoryTests): spent per category in the report period, each top-level category with its
 * subcategories unless `parentId` breaks one down, ranked by spent then name, a share of the total to one
 * decimal, what is not converted left out and counted, and with `compare` the previous period (as many whole
 * months before whole months, otherwise as many days). A test fake may do arithmetic on amounts; the app never does.
 */
export function fakeReportsApi({ categories = defaultTestCategories, expenses = [], income = [], budgets = [], holdings = [], baseCurrency = testUser.baseCurrency, warningPercent = 80 }: Options = {}) {
  const state = {
    expenses: [...expenses],
    income: [...income],
    holdings: [...holdings],
    /** Every query of the net worth report, as sent. */
    netWorthAsked: [] as Asked[],
    /** Every query of the spending by category report, as sent. */
    reportsAsked: [] as Asked[],
    /** Every query of the income vs expenses report, as sent. */
    incomeVsExpensesAsked: [] as Asked[],
    /** Every query of a category's transactions, as sent. */
    transactionsAsked: [] as Asked[],
    /** Every query of the trends report, as sent. */
    trendsAsked: [] as Asked[],
    /** Every query of the budget vs actual report, as sent. */
    budgetVsActualAsked: [] as Asked[],
    /** When set, every request is answered with this status. */
    failWith: undefined as number | undefined,
  }

  const text = (amount: number) => amount.toFixed(2)
  const category = (id: string) => categories.find((each) => each.id === id)
  const view = (each: FakeCategory) => ({ id: each.id, parentId: each.parentId, name: each.name, icon: each.icon, color: each.color, isArchived: each.isArchived })
  const isDate = (date: string | null): date is string => date !== null && /^\d{4}-\d{2}-\d{2}$/.test(date)

  const inPeriod = (from: string, to: string, accountId: string | null) =>
    state.expenses.filter((expense) => expense.date >= from && expense.date <= to && (accountId === null || expense.accountId === accountId))

  /** The row a category's spending is shown in, as the API's SpendingBreakdown has it; null when not shown. */
  const rowOf = (categoryId: string, parentId: string | null, onlyIn: string | null) => {
    const found = category(categoryId)
    if (!found) return null
    if (onlyIn !== null && categoryId !== onlyIn && found.parentId !== onlyIn) return null
    if (parentId === null) return found.parentId ?? categoryId
    return categoryId === parentId || found.parentId === parentId ? categoryId : null
  }

  const grouped = (of: FakeExpense[], parentId: string | null, onlyIn: string | null) => {
    const rows = new Map<string, { spent: number; notConverted: Set<string> }>()
    for (const expense of of) {
      const row = rowOf(expense.categoryId, parentId, onlyIn)
      if (row === null) continue
      const sum = rows.get(row) ?? { spent: 0, notConverted: new Set<string>() }
      if (expense.spent === null) sum.notConverted.add(expense.id)
      else sum.spent += Number(expense.spent)
      rows.set(row, sum)
    }
    return rows
  }

  const totalOf = (rows: Map<string, { spent: number; notConverted: Set<string> }>) => ({
    total: [...rows.values()].reduce((sum, row) => sum + row.spent, 0),
    notConverted: new Set([...rows.values()].flatMap((row) => [...row.notConverted])).size,
  })

  server.use(
    http.get(url('/api/v1/reports/spending-by-category'), ({ request }) => {
      const query = new URL(request.url).searchParams
      state.reportsAsked.push(Object.fromEntries(query))
      if (state.failWith) return problem(state.failWith)
      const [from, to] = [query.get('from'), query.get('to')]
      if (!isDate(from) || !isDate(to) || to < from) return problem(400, { errors: { from: ['Enter a date as YYYY-MM-DD.'] } })
      const [accountId, onlyIn, parentId] = [query.get('accountId'), query.get('categoryId'), query.get('parentId')]
      if (parentId !== null && !category(parentId)) return problem(404)
      const compare = query.get('compare') === 'true'
      const previousPeriod = compare ? previous(from, to) : null

      const current = grouped(inPeriod(from, to, accountId), parentId, onlyIn)
      const before = previousPeriod ? grouped(inPeriod(previousPeriod.from, previousPeriod.to, accountId), parentId, onlyIn) : null
      const { total, notConverted } = totalOf(current)
      const subcategoriesSpent = new Set(
        [...inPeriod(from, to, accountId), ...(previousPeriod ? inPeriod(previousPeriod.from, previousPeriod.to, accountId) : [])]
          .filter((expense) => rowOf(expense.categoryId, parentId, onlyIn) !== null)
          .map((expense) => category(expense.categoryId)!.parentId)
          .filter((parent) => parent !== null),
      )

      const rows = [...new Set([...current.keys(), ...(before?.keys() ?? [])])].map((row) => {
        const spent = current.get(row)?.spent ?? 0
        return {
          category: view(category(row)!),
          spent: text(spent),
          share: total > 0 ? Math.round((spent * 1000) / total) / 10 : null,
          notConverted: current.get(row)?.notConverted.size ?? 0,
          drillsInto: parentId === null && subcategoriesSpent.has(row) ? ('subcategories' as const) : ('transactions' as const),
          previousSpent: before ? text(before.get(row)?.spent ?? 0) : null,
        }
      })
      rows.sort((a, b) => Number(b.spent) - Number(a.spent) || a.category.name.localeCompare(b.category.name))

      const response: SpendingByCategoryResponse = {
        from,
        to,
        currency: baseCurrency,
        parent: parentId === null ? null : view(category(parentId)!),
        total: text(total),
        notConverted,
        items: rows,
        previous: previousPeriod && before ? { ...previousPeriod, total: text(totalOf(before).total), notConverted: totalOf(before).notConverted } : null,
      }
      return HttpResponse.json(response)
    }),
    http.get(url('/api/v1/reports/income-vs-expenses'), ({ request }) => {
      const query = new URL(request.url).searchParams
      state.incomeVsExpensesAsked.push(Object.fromEntries(query))
      if (state.failWith) return problem(state.failWith)
      const [from, to] = [query.get('from'), query.get('to')]
      if (!isDate(from) || !isDate(to) || to < from) return problem(400, { errors: { from: ['Enter a date as YYYY-MM-DD.'] } })
      const [accountId, onlyIn] = [query.get('accountId'), query.get('categoryId')]
      const counts = (each: { categoryId: string; accountId?: string }) =>
        (accountId === null || each.accountId === accountId) &&
        (onlyIn === null || each.categoryId === onlyIn || category(each.categoryId)?.parentId === onlyIn)

      const flowOf = (first: string, last: string) => {
        const coming = state.income.filter((each) => each.date >= first && each.date <= last && counts(each))
        const going = state.expenses.filter((each) => each.date >= first && each.date <= last && counts(each))
        const incomeTotal = coming.reduce((sum, each) => sum + Number(each.amount ?? 0), 0)
        const expenses = going.reduce((sum, each) => sum + Number(each.spent ?? 0), 0)
        const net = incomeTotal - expenses
        return {
          income: text(incomeTotal),
          expenses: text(expenses),
          net: text(net),
          savingsRate: incomeTotal > 0 ? Math.round((net * 1000) / incomeTotal) / 10 : null,
          notConverted: new Set([...coming.filter((each) => each.amount === null), ...going.filter((each) => each.spent === null)].map((each) => each.id)).size,
        }
      }
      const monthsOf = (first: string, last: string) => {
        const months = []
        for (let month = `${first.slice(0, 7)}-01`; month <= last; ) {
          const [year, number] = month.split('-').map(Number) as [number, number]
          const lastDay = new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10)
          const [start, end] = [month < first ? first : month, lastDay > last ? last : lastDay]
          months.push({ month, from: start, to: end, ...flowOf(start, end) })
          month = new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 10)
        }
        return months
      }
      const before = query.get('compare') === 'true' ? previous(from, to) : null

      const response: IncomeVsExpensesResponse = {
        from,
        to,
        currency: baseCurrency,
        total: flowOf(from, to),
        months: monthsOf(from, to),
        previous: before && {
          ...before,
          total: flowOf(before.from, before.to),
          months: previousMonths(from, to).map((month) => ({ month: `${month.from.slice(0, 7)}-01`, ...month, ...flowOf(month.from, month.to) })),
        },
      }
      return HttpResponse.json(response)
    }),
    http.get(url('/api/v1/reports/spending-by-category/transactions'), ({ request }) => {
      const query = new URL(request.url).searchParams
      state.transactionsAsked.push(Object.fromEntries(query))
      if (state.failWith) return problem(state.failWith)
      const [from, to, categoryId] = [query.get('from'), query.get('to'), query.get('categoryId')]
      if (!isDate(from) || !isDate(to) || !categoryId) return problem(400, { errors: { categoryId: ['Choose a category.'] } })
      const found = category(categoryId)
      if (!found) return problem(404)

      const byTransaction = new Map<string, FakeExpense[]>()
      for (const expense of state.expenses) byTransaction.set(expense.id, [...(byTransaction.get(expense.id) ?? []), expense])
      const items = inPeriod(from, to, query.get('accountId'))
        .filter((expense) => expense.categoryId === categoryId)
        .toSorted((a, b) => b.date.localeCompare(a.date))
        .map((expense) => ({
          id: expense.id,
          date: expense.date,
          accountId: expense.accountId ?? 'a-everyday',
          payee: expense.payee ?? null,
          note: expense.note ?? null,
          amount: expense.amount ?? (expense.spent === null ? '0.00' : text(Math.abs(Number(expense.spent)))),
          currency: expense.currency ?? baseCurrency,
          isRefund: expense.isRefund ?? false,
          isSplit: byTransaction.get(expense.id)!.length > 1,
          spent: expense.spent,
        }))

      const response: SpendingTransactionsResponse = {
        from,
        to,
        currency: baseCurrency,
        category: view(found),
        total: text(items.reduce((sum, item) => sum + Number(item.spent ?? 0), 0)),
        notConverted: items.filter((item) => item.spent === null).length,
        items,
      }
      return HttpResponse.json(response)
    }),
    http.get(url('/api/v1/reports/net-worth'), ({ request }) => {
      const query = new URL(request.url).searchParams
      state.netWorthAsked.push(Object.fromEntries(query))
      if (state.failWith) return problem(state.failWith)
      const [from, to, accountId] = [query.get('from'), query.get('to'), query.get('accountId')]
      if (!isDate(from) || !isDate(to) || to < from) return problem(400, { errors: { from: ['Enter a date as YYYY-MM-DD.'] } })

      const items = monthsOf(from, to).map(({ to: day }) => {
        const held = new Map<string, FakeHolding>()
        for (const holding of state.holdings.toSorted((a, b) => a.from.localeCompare(b.from))) {
          if (holding.from <= day && (accountId === null || holding.accountId === accountId)) held.set(holding.accountId, holding)
        }
        let [assets, liabilities, notConverted] = [0, 0, 0]
        for (const holding of held.values()) {
          if (holding.balance === null) notConverted++
          else if (holding.holdsAmountOwed) liabilities -= Number(holding.balance)
          else assets += Number(holding.balance)
        }
        return { date: day, assets: text(assets), liabilities: text(liabilities), netWorth: text(assets - liabilities), notConverted }
      })

      const response: NetWorthResponse = { from, to, currency: baseCurrency, items }
      return HttpResponse.json(response)
    }),
    http.get(url('/api/v1/reports/trends'), ({ request }) => {
      const query = new URL(request.url).searchParams
      state.trendsAsked.push(Object.fromEntries(query))
      if (state.failWith) return problem(state.failWith)
      const [from, to, categoryId, accountId] = [query.get('from'), query.get('to'), query.get('categoryId'), query.get('accountId')]
      const payee = query.get('payee')?.trim().toLowerCase() || null
      if (!isDate(from) || !isDate(to) || to < from) return problem(400, { errors: { from: ['Enter a date as YYYY-MM-DD.'] } })
      if (categoryId === null && payee === null) return problem(400, { errors: { categoryId: ['Choose a category or a payee.'] } })
      const followed = categoryId === null ? null : category(categoryId)
      if (categoryId !== null && !followed) return problem(404)
      const isIncome = followed ? followed.kind === 'income' : query.get('type') === 'income'

      const counts = (expense: FakeExpense) => {
        const of = category(expense.categoryId)
        if (!of) return false
        if (followed && expense.categoryId !== followed.id && of.parentId !== followed.id) return false
        if (!followed && (of.kind === 'income') !== isIncome) return false
        return payee === null || expense.payee?.trim().toLowerCase() === payee
      }
      const sum = (expenses: FakeExpense[]) => ({
        total: expenses.reduce((total, expense) => total + Number(expense.spent ?? 0), 0),
        notConverted: new Set(expenses.filter((expense) => expense.spent === null).map((expense) => expense.id)).size,
      })
      const trend = (from: string, to: string, buckets = monthsOf(from, to)) => {
        const followedHere = inPeriod(from, to, accountId).filter(counts)
        const months: TrendMonthResponse[] = []
        let before: number | null = null
        for (const { from: start, to: end } of buckets) {
          const month = sum(followedHere.filter((expense) => expense.date >= start && expense.date <= end))
          months.push({ from: start, to: end, total: text(month.total), notConverted: month.notConverted, change: before === null ? null : changeOf(month.total, before) })
          before = month.total
        }
        return { from, to, ...sum(followedHere), months }
      }

      const current = trend(from, to)
      const previousPeriod = query.get('compare') === 'true' ? previous(from, to) : null
      const before = previousPeriod && trend(previousPeriod.from, previousPeriod.to, previousMonths(from, to))
      const response: TrendResponse = {
        from,
        to,
        currency: baseCurrency,
        category: followed ? view(followed) : null,
        payee: query.get('payee')?.trim() || null,
        isIncome,
        total: text(current.total),
        notConverted: current.notConverted,
        months: current.months,
        previous: before && { ...before, total: text(before.total) },
        change: before && changeOf(current.total, before.total),
      }
      return HttpResponse.json(response)
    }),
    http.get(url('/api/v1/reports/budget-vs-actual'), ({ request }) => {
      const query = new URL(request.url).searchParams
      state.budgetVsActualAsked.push(Object.fromEntries(query))
      if (state.failWith) return problem(state.failWith)
      const [asked, until, accountId, onlyIn] = [query.get('from'), query.get('to'), query.get('accountId'), query.get('categoryId')]
      if (!isDate(asked) || !isDate(until) || until < asked) return problem(400, { errors: { from: ['Enter a date as YYYY-MM-DD.'] } })
      // The whole budget months the period touches, as the API's ReportPeriod.WholeMonths.
      const [from, to] = [`${asked.slice(0, 8)}01`, lastOfMonth(until)]
      const months = monthsOf(from, to).map((month) => month.from.slice(0, 7))
      const shown = (categoryId: string) => onlyIn === null || categoryId === onlyIn || category(categoryId)?.parentId === onlyIn
      const budgetOn = (month: string, categoryId: string) => budgets.find((budget) => budget.month === month && budget.categoryId === categoryId)

      const items = new Map<string, { months: number; budgeted: number; spent: number; notConverted: Set<string> }>()
      const unbudgeted = new Map<string, { spent: number; notConverted: Set<string> }>()
      for (const budget of budgets.filter((each) => months.includes(each.month) && shown(each.categoryId))) {
        const item = items.get(budget.categoryId) ?? { months: 0, budgeted: 0, spent: 0, notConverted: new Set<string>() }
        item.months += 1
        item.budgeted += Number(budget.amount)
        items.set(budget.categoryId, item)
      }
      for (const expense of inPeriod(from, to, accountId)) {
        const of = category(expense.categoryId)
        if (!of || of.kind !== 'expense' || !shown(of.id)) continue
        const month = expense.date.slice(0, 7)
        // A budget on the category itself, or on its parent, counts it (spec section 3, rule 6).
        const coveredBy = budgetOn(month, of.id) ? of.id : of.parentId && budgetOn(month, of.parentId) ? of.parentId : null
        const sum = coveredBy ? items.get(coveredBy) : (unbudgeted.get(of.id) ?? { spent: 0, notConverted: new Set<string>() })
        if (!sum) continue
        if (expense.spent === null) sum.notConverted.add(expense.id)
        else sum.spent += Number(expense.spent)
        if (!coveredBy) unbudgeted.set(of.id, sum)
      }

      const stateOf = (budgeted: number, spent: number) =>
        spent > budgeted ? ('over' as const) : budgeted > 0 && (spent * 100) / budgeted >= warningPercent ? ('warning' as const) : ('onTrack' as const)
      const treeOrder = (id: string) => {
        const of = category(id)!
        const top = of.parentId ? category(of.parentId)! : of
        return [top.name, of.parentId ? of.name : '']
      }
      const itemRows = [...items.entries()]
        .toSorted(([a], [b]) => treeOrder(a)[0]!.localeCompare(treeOrder(b)[0]!) || treeOrder(a)[1]!.localeCompare(treeOrder(b)[1]!))
        .map(([id, item]) => ({
          category: view(category(id)!),
          months: item.months,
          budgeted: text(item.budgeted),
          spent: text(item.spent),
          remaining: text(item.budgeted - item.spent),
          percentSpent: item.budgeted === 0 ? null : Math.floor((item.spent * 100) / item.budgeted),
          state: stateOf(item.budgeted, item.spent),
          notConverted: item.notConverted.size,
        }))
      const unbudgetedRows = [...unbudgeted.entries()]
        .map(([id, sum]) => ({ category: view(category(id)!), spent: text(sum.spent), notConverted: sum.notConverted.size }))
        .toSorted((a, b) => Number(b.spent) - Number(a.spent) || a.category.name.localeCompare(b.category.name))
      const counted = (sums: Iterable<{ notConverted: Set<string> }>) => new Set([...sums].flatMap((sum) => [...sum.notConverted])).size
      const add = (values: number[]) => values.reduce((total, value) => total + value, 0)

      const response: BudgetVsActualResponse = {
        from,
        to,
        months: months.length,
        currency: baseCurrency,
        warningPercent,
        items: itemRows,
        totals: {
          budgeted: text(add([...items.values()].map((item) => item.budgeted))),
          spent: text(add([...items.values()].map((item) => item.spent))),
          remaining: text(add([...items.values()].map((item) => item.budgeted - item.spent))),
          notConverted: counted(items.values()),
        },
        unbudgeted: unbudgetedRows,
        unbudgetedTotal: { spent: text(add([...unbudgeted.values()].map((sum) => sum.spent))), notConverted: counted(unbudgeted.values()) },
      }
      return HttpResponse.json(response)
    }),
  )

  return state
}

/** How a total moved from the one before, as the API's PeriodChange works it out: none as a percentage from zero. */
function changeOf(total: number, before: number) {
  return { amount: (total - before).toFixed(2), percent: before === 0 ? null : Math.round(((total - before) * 1000) / Math.abs(before)) / 10 }
}

function firstOfNextMonth(date: string) {
  const [year, month] = date.split('-').map(Number)
  return new Date(Date.UTC(year!, month!, 1)).toISOString().slice(0, 10)
}

function lastOfMonth(date: string) {
  const [year, month] = date.split('-').map(Number)
  return new Date(Date.UTC(year!, month!, 0)).toISOString().slice(0, 10)
}

/** The calendar months a period touches, each cut to it, as the API's ReportPeriod.Months has them. */
function monthsOf(from: string, to: string): { from: string; to: string }[] {
  const months = []
  for (let start = from; start <= to; start = firstOfNextMonth(start)) months.push({ from: start, to: [lastOfMonth(start), to].toSorted()[0]! })
  return months
}

/**
 * The months of the period compared with, one at the same place as each of the period's, as the API's
 * ReportPeriod.PreviousMonths has them: calendar months before whole months, otherwise each moved back by the days.
 */
function previousMonths(from: string, to: string): { from: string; to: string }[] {
  const before = previous(from, to)
  const wholeMonths = from.endsWith('-01') && to === lastOfMonth(to)
  if (wholeMonths) return monthsOf(before.from, before.to)
  const shift = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - (Date.parse(`${from}T00:00:00Z`) - Date.parse(`${before.from}T00:00:00Z`))).toISOString().slice(0, 10)
  return monthsOf(from, to).map((month) => ({ from: shift(month.from), to: shift(month.to) }))
}

/** The period a report period is compared with, as the API's ReportPeriod.Previous works it out. */
function previous(from: string, to: string): { from: string; to: string } {
  const day = (date: string) => new Date(`${date}T00:00:00Z`)
  const write = (date: Date) => date.toISOString().slice(0, 10)
  const start = day(from)
  const end = day(to)
  const lastOfMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate()
  const dayBefore = new Date(start.getTime() - 86_400_000)
  if (start.getUTCDate() === 1 && end.getUTCDate() === lastOfMonth) {
    const months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() + 1
    return { from: write(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - months, 1))), to: write(dayBefore) }
  }
  const days = (end.getTime() - start.getTime()) / 86_400_000 + 1
  return { from: write(new Date(start.getTime() - days * 86_400_000)), to: write(dayBefore) }
}
