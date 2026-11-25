import { http, HttpResponse } from 'msw'
import type { components } from '@/shared/api/schema'
import { defaultTestCategories, type FakeCategory } from './fakeCategoriesApi'
import { apiUrl as url, problem, server, testUser } from './server'

type SpendingByCategoryResponse = components['schemas']['SpendingByCategoryResponse']
type SpendingTransactionsResponse = components['schemas']['SpendingTransactionsResponse']
type Currency = components['schemas']['Currency']

/**
 * One expense, or one line of a split expense, as the fake keeps it. The lines of a split share an `id` and
 * each has its own category and part.
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

type Options = {
  categories?: FakeCategory[]
  expenses?: FakeExpense[]
  baseCurrency?: Currency
}

/** Every query the report and its transactions were asked with, in the order they arrived. */
type Asked = Record<string, string>

/**
 * A stand-in for the API's spending by category report, following the same rules as the real API (see the API's
 * SpendingByCategoryTests): spent per category in the report period, each top-level category with its
 * subcategories unless `parentId` breaks one down, ranked by spent then name, a share of the total to one
 * decimal, what is not converted left out and counted, and with `compare` the previous period (as many whole
 * months before whole months, otherwise as many days). A test fake may do arithmetic on amounts; the app never does.
 */
export function fakeReportsApi({ categories = defaultTestCategories, expenses = [], baseCurrency = testUser.baseCurrency }: Options = {}) {
  const state = {
    expenses: [...expenses],
    /** Every query of the report, as sent. */
    reportsAsked: [] as Asked[],
    /** Every query of a category's transactions, as sent. */
    transactionsAsked: [] as Asked[],
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
  )

  return state
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
