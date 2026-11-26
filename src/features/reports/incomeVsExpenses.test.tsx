import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeAccountsApi } from '@/test/fakeAccountsApi'
import { fakeCategoriesApi } from '@/test/fakeCategoriesApi'
import { fakeReportsApi, type FakeExpense, type FakeIncome } from '@/test/fakeReportsApi'
import { renderApp } from '@/test/renderApp'

const report = '/reports/income-vs-expenses'
const firstQuarter = `${report}?period=custom&from=2026-01-01&to=2026-03-31`

const income: FakeIncome[] = [
  { id: 't-january-salary', date: '2026-01-05', categoryId: 'c-salary', accountId: 'a-everyday', amount: '20000000' },
  { id: 't-march-salary', date: '2026-03-31', categoryId: 'c-salary', accountId: 'a-everyday', amount: '10000000' },
  { id: 't-december-salary', date: '2025-12-05', categoryId: 'c-salary', accountId: 'a-everyday', amount: '8000000' },
]

const expenses: FakeExpense[] = [
  { id: 't-car', date: '2026-01-20', categoryId: 'c-transport', accountId: 'a-card', spent: '15000000' },
  { id: 't-market', date: '2026-03-01', categoryId: 'c-groceries', accountId: 'a-everyday', spent: '12500000' },
  { id: 't-november', date: '2025-11-01', categoryId: 'c-groceries', accountId: 'a-everyday', spent: '6000000' },
]

function setUp(options: { income?: FakeIncome[]; expenses?: FakeExpense[] } = {}) {
  fakeCategoriesApi()
  fakeAccountsApi([
    { id: 'a-everyday', name: 'Everyday' },
    { id: 'a-card', name: 'Card' },
  ])
  return fakeReportsApi({ income: options.income ?? income, expenses: options.expenses ?? expenses })
}

const rowsOf = async (name = 'Income vs expenses') =>
  within(await screen.findByRole('table', { name }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => [...within(row).getAllByRole('rowheader'), ...within(row).getAllByRole('cell')].map((cell) => cell.textContent))

const summary = () => screen.findByRole('region', { name: 'Whole period' })

describe('the income vs expenses report', () => {
  it('is one of the reports to choose from', async () => {
    setUp()
    const { user } = renderApp('/reports/spending-by-category')

    await user.click(await screen.findByRole('link', { name: 'Income vs expenses' }))

    expect(await screen.findByRole('heading', { level: 2, name: 'Income vs expenses' })).toBeInTheDocument()
  })

  it('shows income, expenses, net and the savings rate of each month as a table, with the whole period at the foot', async () => {
    const api = setUp()
    renderApp(`${firstQuarter}&view=table`)

    expect(await rowsOf()).toEqual([
      ['January 2026', '₫20,000,000', '₫15,000,000', '₫5,000,000', '25%'],
      ['February 2026', '₫0', '₫0', '₫0', '–'],
      ['March 2026', '₫10,000,000', '₫12,500,000', '-₫2,500,000', '-25%'],
      ['Whole period', '₫30,000,000', '₫27,500,000', '₫2,500,000', '8.3%'],
    ])
    expect(api.incomeVsExpensesAsked.at(-1)).toEqual({ from: '2026-01-01', to: '2026-03-31' })
  })

  it('shows the savings rate of the whole period beside its income, expenses and net', async () => {
    setUp()
    renderApp(firstQuarter)

    const whole = await summary()
    await waitFor(() => expect(whole).toHaveTextContent('Savings rate8.3%'))
    expect(whole).toHaveTextContent('Income₫30,000,000')
    expect(whole).toHaveTextContent('Expenses₫27,500,000')
    expect(whole).toHaveTextContent('Net₫2,500,000')
  })

  it('draws the months as grouped bars with a net line, the numbers being in the table view', async () => {
    setUp()
    renderApp(firstQuarter)

    const chart = await screen.findByRole('img', { name: 'Income and expenses per month, with net' })
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(within(chart).queryByText('Net, previous period')).not.toBeInTheDocument()
  })

  it('writes the amounts on the chart axis short, as every chart axis does', async () => {
    setUp()
    renderApp(firstQuarter)

    const chart = await screen.findByRole('img', { name: 'Income and expenses per month, with net' })
    await waitFor(() => expect(within(chart).getByText('21M')).toBeInTheDocument())
    expect(within(chart).queryByText('₫21,000,000')).not.toBeInTheDocument()
  })

  it('draws the previous period\'s net beside the months when compared, month by month in order', async () => {
    setUp()
    renderApp(`${firstQuarter}&compare=true`)

    const chart = await screen.findByRole('img', { name: 'Income and expenses per month, with net' })
    await waitFor(() => expect(within(chart).getByText('Net, previous period')).toBeInTheDocument())
    expect(within(chart).getByText('Net')).toBeInTheDocument()
  })

  it('compares with the previous period', async () => {
    const api = setUp()
    const { user } = renderApp(`${firstQuarter}&view=table`)

    await user.click(within(await screen.findByRole('search', { name: 'Report filters' })).getByRole('checkbox', { name: 'Compare with the previous period' }))

    const previous = await screen.findByRole('region', { name: 'Previous period, Oct 1, 2025 to Dec 31, 2025' })
    await waitFor(() => expect(previous).toHaveTextContent('Income₫8,000,000'))
    expect(previous).toHaveTextContent('Expenses₫6,000,000')
    expect(previous).toHaveTextContent('Net₫2,000,000')
    expect(previous).toHaveTextContent('Savings rate25%')
    expect(api.incomeVsExpensesAsked.at(-1)).toMatchObject({ compare: 'true' })
    expect(await rowsOf('Income vs expenses, previous period')).toEqual([
      ['October 2025', '₫0', '₫0', '₫0', '–'],
      ['November 2025', '₫0', '₫6,000,000', '-₫6,000,000', '–'],
      ['December 2025', '₫8,000,000', '₫0', '₫8,000,000', '100%'],
      ['Whole period', '₫8,000,000', '₫6,000,000', '₫2,000,000', '25%'],
    ])
  })

  it('names each month of the period before one that is not whole months by its days, set against the month at the same place', async () => {
    setUp({
      income: [{ id: 't-february-pay', date: '2026-02-18', categoryId: 'c-salary', accountId: 'a-everyday', amount: '5000000' }],
      expenses: [{ id: 't-january-shop', date: '2026-01-27', categoryId: 'c-groceries', accountId: 'a-everyday', spent: '1000000' }],
    })
    renderApp(`${report}?period=custom&from=2026-03-10&to=2026-04-20&compare=true&view=table`)

    expect(await rowsOf('Income vs expenses, previous period')).toEqual([
      ['Jan 27, 2026 to Feb 17, 2026', '₫0', '₫1,000,000', '-₫1,000,000', '–'],
      ['Feb 18, 2026 to Mar 9, 2026', '₫5,000,000', '₫0', '₫5,000,000', '100%'],
      ['Whole period', '₫5,000,000', '₫1,000,000', '₫4,000,000', '80%'],
    ])
  })

  it('offers income and expense categories alike to filter by', async () => {
    setUp()
    renderApp(report)

    const category = within(await screen.findByRole('search', { name: 'Report filters' })).getByRole('combobox', { name: 'Category' })
    await waitFor(() => expect(within(category).getByRole('option', { name: 'Salary' })).toBeInTheDocument())
    expect(within(category).getByRole('option', { name: 'Transport' })).toBeInTheDocument()
  })

  it('flags what is not converted and so left out', async () => {
    setUp({ income: [{ id: 't-dollars', date: '2026-01-05', categoryId: 'c-salary', amount: null }], expenses: [] })
    renderApp(`${firstQuarter}&view=table`)

    expect(await screen.findByText('1 amount is not converted into your base currency yet and is left out.')).toBeInTheDocument()
  })

  it('says so when the report cannot be loaded', async () => {
    const api = setUp()
    api.failWith = 500
    renderApp(firstQuarter)

    expect(await screen.findByText('The report could not be loaded. Try again in a moment.')).toBeInTheDocument()
  })
})
