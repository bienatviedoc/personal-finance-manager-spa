import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeAccountsApi } from '@/test/fakeAccountsApi'
import { fakeCategoriesApi } from '@/test/fakeCategoriesApi'
import { fakeReportsApi, type FakeExpense } from '@/test/fakeReportsApi'
import { renderApp } from '@/test/renderApp'

const report = '/reports/trends'
const firstQuarter = 'period=custom&from=2026-01-01&to=2026-03-31'

/** Food over the first quarter of 2026: nothing in February, and a market visit each month it shopped. */
const food: FakeExpense[] = [
  { id: 't-jan-market', date: '2026-01-10', categoryId: 'c-groceries', spent: '400000', payee: 'Market' },
  { id: 't-jan-coffee', date: '2026-01-20', categoryId: 'c-eating-out', spent: '100000', payee: 'Cafe' },
  { id: 't-mar-market', date: '2026-03-05', categoryId: 'c-groceries', spent: '600000', payee: 'market ' },
  { id: 't-mar-bus', date: '2026-03-06', categoryId: 'c-transport', spent: '50000', payee: 'Market' },
  { id: 't-dec-market', date: '2025-12-15', categoryId: 'c-food', spent: '250000', payee: 'Market' },
]

function setUp(expenses: FakeExpense[] = food) {
  fakeCategoriesApi()
  fakeAccountsApi([{ id: 'a-everyday', name: 'Everyday' }])
  return fakeReportsApi({ expenses })
}

const table = () => screen.findByRole('table', { name: /^Trend/ })
const rowsOf = async () =>
  within(await table())
    .getAllByRole('row')
    .slice(1)
    .map((row) => [...within(row).getAllByRole('rowheader'), ...within(row).getAllByRole('cell')].map((cell) => cell.textContent))

describe('the trends report', () => {
  it("shows a category's total for each month, with its change from the month before as an amount and a percentage", async () => {
    const api = setUp()
    renderApp(`${report}?${firstQuarter}&categoryId=c-food&view=table`)

    expect(await screen.findByRole('heading', { level: 2, name: 'Trends' })).toBeInTheDocument()
    expect(await rowsOf()).toEqual([
      ['January 2026', '₫500,000', '', ''],
      ['February 2026', '₫0', '-₫500,000', '-100%'],
      ['March 2026', '₫600,000', '+₫600,000', ''],
    ])
    expect(api.trendsAsked.at(-1)).toEqual({ from: '2026-01-01', to: '2026-03-31', categoryId: 'c-food' })
    expect(screen.getByText('Total spent').parentElement).toHaveTextContent('Total spent₫1,100,000')
  })

  it('draws the months as a line, with the same numbers in the table view', async () => {
    setUp()
    const { user } = renderApp(`${report}?${firstQuarter}&categoryId=c-food`)

    expect(await screen.findByRole('img', { name: 'Trend of Food & drink' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Table' }))
    expect(await rowsOf()).toHaveLength(3)
  })

  it('asks what to follow until a category or a payee is chosen', async () => {
    const api = setUp()
    renderApp(`${report}?${firstQuarter}`)

    expect(await screen.findByText('Choose a category or type a payee to follow it month by month.')).toBeInTheDocument()
    expect(api.trendsAsked).toEqual([])
  })

  it('follows a payee typed, in any case, and keeps it in the address', async () => {
    const api = setUp()
    const { user, router } = renderApp(`${report}?${firstQuarter}&view=table`)

    await user.type(await screen.findByLabelText('Payee'), 'MARKET')

    await waitFor(() => expect(api.trendsAsked.at(-1)).toEqual({ from: '2026-01-01', to: '2026-03-31', payee: 'MARKET' }))
    expect(await rowsOf()).toEqual([
      ['January 2026', '₫400,000', '', ''],
      ['February 2026', '₫0', '-₫400,000', '-100%'],
      ['March 2026', '₫650,000', '+₫650,000', ''],
    ])
    expect(new URLSearchParams(router.state.location.search).get('payee')).toBe('MARKET')
  })

  it('follows a payee only in the category chosen with it', async () => {
    setUp()
    renderApp(`${report}?${firstQuarter}&categoryId=c-food&payee=Market&view=table`)

    expect(await screen.findByLabelText('Payee')).toHaveValue('Market')
    expect(await screen.findByRole('table', { name: 'Trend of Food & drink, Market' })).toBeInTheDocument()
    expect((await rowsOf()).map((row) => row[1])).toEqual(['₫400,000', '₫0', '₫600,000'])
  })

  it('offers income categories too, and adds up what was received in one', async () => {
    setUp([{ id: 't-pay', date: '2026-01-25', categoryId: 'c-salary', spent: '20000000' }])
    renderApp(`${report}?${firstQuarter}&categoryId=c-salary&view=table`)

    expect(await screen.findByText('Total received')).toBeInTheDocument()
    const category = within(screen.getByRole('search', { name: 'Report filters' })).getByRole('combobox', { name: 'Category' })
    await waitFor(() => expect(within(category).getByRole('option', { name: 'Salary' })).toBeInTheDocument())
  })

  it('compares each month and the total with the previous period', async () => {
    const api = setUp()
    renderApp(`${report}?period=custom&from=2026-02-01&to=2026-03-31&categoryId=c-food&compare=true&view=table`)

    expect(await rowsOf()).toEqual([
      ['February 2026', '₫0', '', '', '₫250,000December 2025'],
      ['March 2026', '₫600,000', '+₫600,000', '', '₫500,000January 2026'],
    ])
    expect(api.trendsAsked.at(-1)).toMatchObject({ compare: 'true' })
    expect(screen.getByText('Previous period, Dec 1, 2025 to Jan 31, 2026').parentElement).toHaveTextContent('₫750,000')
    expect(screen.getByText('Change from the previous period').parentElement).toHaveTextContent('-₫150,000-20%')
  })

  it('sets each month against the one at the same place in the previous period, also when the period is not whole months', async () => {
    setUp([
      { id: 't-jan', date: '2026-01-27', categoryId: 'c-groceries', spent: '100000' },
      { id: 't-feb', date: '2026-02-18', categoryId: 'c-groceries', spent: '70000' },
      { id: 't-mar', date: '2026-03-12', categoryId: 'c-groceries', spent: '90000' },
    ])
    renderApp(`${report}?period=custom&from=2026-03-10&to=2026-04-20&categoryId=c-food&compare=true&view=table`)

    expect(await rowsOf()).toEqual([
      ['March 2026', '₫90,000', '', '', '₫100,000Jan 27, 2026 to Feb 17, 2026'],
      ['April 2026', '₫0', '-₫90,000', '-100%', '₫70,000Feb 18, 2026 to Mar 9, 2026'],
    ])
  })

  it('follows a payee alone by what was received from it when asked', async () => {
    const api = setUp([
      { id: 't-pay', date: '2026-01-25', categoryId: 'c-salary', spent: '20000000', payee: 'Acme' },
      { id: 't-lunch', date: '2026-01-26', categoryId: 'c-eating-out', spent: '100000', payee: 'Acme' },
    ])
    const { user, router } = renderApp(`${report}?${firstQuarter}&payee=Acme&view=table`)

    expect((await rowsOf())[0]![1]).toBe('₫100,000')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Follow' }), 'Received from them')

    await waitFor(() => expect(api.trendsAsked.at(-1)).toEqual({ from: '2026-01-01', to: '2026-03-31', payee: 'Acme', type: 'income' }))
    expect(await screen.findByText('Total received')).toBeInTheDocument()
    await waitFor(async () => expect((await rowsOf())[0]![1]).toBe('₫20,000,000'))
    expect(new URLSearchParams(router.state.location.search).get('type')).toBe('income')
  })

  it('offers no choice of what to follow a payee by once a category says it', async () => {
    setUp()
    renderApp(`${report}?${firstQuarter}&categoryId=c-food&payee=Market&view=table`)

    expect(await table()).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Follow' })).not.toBeInTheDocument()
  })

  it('flags what is not converted, and says when the report cannot be loaded', async () => {
    const api = setUp([{ id: 't-abroad', date: '2026-01-03', categoryId: 'c-groceries', spent: null }])
    renderApp(`${report}?${firstQuarter}&categoryId=c-food&view=table`)

    expect((await rowsOf())[0]).toEqual(['January 2026', '₫01 not converted', '', ''])
    expect(screen.getByText('1 amount is not converted into your base currency yet and is left out.')).toBeInTheDocument()

    api.failWith = 500
    renderApp(`${report}?period=custom&from=2026-04-01&to=2026-04-30&categoryId=c-food`)
    expect(await screen.findByRole('alert')).toHaveTextContent('The report could not be loaded.')
  })
})
