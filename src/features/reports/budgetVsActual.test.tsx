import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeAccountsApi } from '@/test/fakeAccountsApi'
import { fakeCategoriesApi } from '@/test/fakeCategoriesApi'
import { fakeReportsApi, type FakeBudget, type FakeExpense } from '@/test/fakeReportsApi'
import { renderApp } from '@/test/renderApp'

const report = '/reports/budget-vs-actual'
const march = 'period=custom&from=2026-03-01&to=2026-03-31'

/** March 2026: food within its budget, transport near its own, and coffee with no budget at all. */
const budgets: FakeBudget[] = [
  { month: '2026-03', categoryId: 'c-food', amount: '3000000' },
  { month: '2026-03', categoryId: 'c-transport', amount: '500000' },
]
const expenses: FakeExpense[] = [
  { id: 't-market', date: '2026-03-02', categoryId: 'c-groceries', spent: '1200000' },
  { id: 't-dinner', date: '2026-03-05', categoryId: 'c-food', spent: '300000' },
  { id: 't-bus', date: '2026-03-31', categoryId: 'c-transport', spent: '450000' },
  { id: 't-taxi', date: '2026-02-20', categoryId: 'c-transport', spent: '999000' },
]

function setUp(options: { budgets?: FakeBudget[]; expenses?: FakeExpense[] } = {}) {
  fakeCategoriesApi()
  fakeAccountsApi([{ id: 'a-everyday', name: 'Everyday' }])
  return fakeReportsApi({ budgets, expenses, ...options })
}

const rowsOf = async (name: string | RegExp) =>
  within(await screen.findByRole('table', { name }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => [...within(row).queryAllByRole('rowheader'), ...within(row).getAllByRole('cell')].map((cell) => cell.textContent))

describe('the budget vs actual report', () => {
  it('asks for what the account and category filters narrow it to, and offers only expense categories', async () => {
    const api = setUp()
    renderApp(`${report}?${march}&accountId=a-everyday&categoryId=c-food&view=table`)

    await rowsOf('Budget vs actual')
    expect(api.budgetVsActualAsked.at(-1)).toEqual({ from: '2026-03-01', to: '2026-03-31', accountId: 'a-everyday', categoryId: 'c-food' })
    const category = within(screen.getByRole('search', { name: 'Report filters' })).getByRole('combobox', { name: 'Category' })
    expect(within(category).queryByRole('option', { name: 'Salary' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Compare with the previous period' })).not.toBeInTheDocument()
  })

  it('says when no budget was set in the months', async () => {
    setUp({ budgets: [] })
    renderApp(`${report}?${march}`)

    expect(await screen.findByText('No budget was set in these months.')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Budgeted against spent per category' })).not.toBeInTheDocument()
  })

  it('flags what is not converted, and says when the report cannot be loaded', async () => {
    const api = setUp({ expenses: [{ id: 't-abroad', date: '2026-03-03', categoryId: 'c-groceries', spent: null }] })
    renderApp(`${report}?${march}&view=table`)

    expect((await rowsOf('Budget vs actual'))[0]).toEqual(['Food & drink', '₫3,000,000', '₫01 not converted', '₫3,000,000', '0%', 'On track'])
    expect(screen.getByText('1 amount is not converted into your base currency yet and is left out.')).toBeInTheDocument()

    api.failWith = 500
    renderApp(`${report}?period=custom&from=2026-04-01&to=2026-04-30`)
    expect(await screen.findByRole('alert')).toHaveTextContent('The report could not be loaded.')
  })

  it('sets each budget of a month against what was spent in its category and subcategories, with the totals', async () => {
    const api = setUp()
    renderApp(`${report}?${march}&view=table`)

    expect(await screen.findByRole('heading', { level: 2, name: 'Budget vs actual' })).toBeInTheDocument()
    expect(await rowsOf('Budget vs actual')).toEqual([
      ['Food & drink', '₫3,000,000', '₫1,500,000', '₫1,500,000', '50%', 'On track'],
      ['Transport', '₫500,000', '₫450,000', '₫50,000', '90%', 'Warning'],
      ['Total', '₫3,500,000', '₫1,950,000', '₫1,550,000', '', ''],
    ])
    expect(api.budgetVsActualAsked.at(-1)).toEqual({ from: '2026-03-01', to: '2026-03-31' })
  })

  it('draws budgeted and spent as horizontal bars, with the same numbers in the table view', async () => {
    setUp()
    const { user } = renderApp(`${report}?${march}`)

    expect(await screen.findByRole('img', { name: 'Budgeted against spent per category' })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Budget vs actual' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Table' }))
    expect(await rowsOf('Budget vs actual')).toHaveLength(3)
  })

  it('lists apart, in either view, the categories where something was spent with no budget', async () => {
    setUp({
      budgets: [
        { month: '2026-03', categoryId: 'c-groceries', amount: '2000000' },
        { month: '2026-03', categoryId: 'c-transport', amount: '500000' },
      ],
      expenses: [
        { id: 't-market', date: '2026-03-02', categoryId: 'c-groceries', spent: '800000' },
        { id: 't-coffee', date: '2026-03-03', categoryId: 'c-eating-out', spent: '150000' },
        { id: 't-taxi', date: '2026-02-20', categoryId: 'c-transport', spent: '200000' },
      ],
    })
    renderApp(`${report}?period=custom&from=2026-02-01&to=2026-03-31`)

    expect(await screen.findByRole('heading', { name: 'Spent with no budget' })).toBeInTheDocument()
    expect(await rowsOf('Spent with no budget')).toEqual([
      ['Transport', '₫200,000'],
      ['Eating out', '₫150,000'],
      ['Total', '₫350,000'],
    ])
  })

  it('sums each category over a range of months, saying how many it has a budget in', async () => {
    setUp({
      budgets: [
        { month: '2026-02', categoryId: 'c-transport', amount: '500000' },
        { month: '2026-03', categoryId: 'c-transport', amount: '500000' },
        { month: '2026-03', categoryId: 'c-food', amount: '1000000' },
      ],
      expenses: [
        { id: 't-taxi', date: '2026-02-20', categoryId: 'c-transport', spent: '700000' },
        { id: 't-bus', date: '2026-03-10', categoryId: 'c-transport', spent: '400000' },
      ],
    })
    renderApp(`${report}?period=custom&from=2026-02-10&to=2026-03-20&view=table`)

    expect(await screen.findByText('Budget months February 2026 to March 2026, summed')).toBeInTheDocument()
    expect(await rowsOf('Budget vs actual')).toEqual([
      ['Food & drink1 of 2 months', '₫1,000,000', '₫0', '₫1,000,000', '0%', 'On track'],
      ['Transport', '₫1,000,000', '₫1,100,000', '-₫100,000', '110%', 'Over budget'],
      ['Total', '₫2,000,000', '₫1,100,000', '₫900,000', '', ''],
    ])
  })
})
