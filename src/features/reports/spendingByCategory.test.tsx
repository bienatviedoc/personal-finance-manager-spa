import { cleanup, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { todayIn } from '@/shared/dates'
import { fakeAccountsApi } from '@/test/fakeAccountsApi'
import { fakeCategoriesApi } from '@/test/fakeCategoriesApi'
import { fakeReportsApi, type FakeExpense } from '@/test/fakeReportsApi'
import { renderApp } from '@/test/renderApp'
import { testUser } from '@/test/server'
import { periodOf } from './frame/reportPeriod'

const report = '/reports/spending-by-category'
const thisMonth = periodOf('thisMonth', todayIn(testUser.timeZone))

/** March 2026: groceries and coffee under Food & drink, and Transport on its own. */
const march: FakeExpense[] = [
  { id: 't-market', date: '2026-03-02', categoryId: 'c-groceries', accountId: 'a-everyday', spent: '500000', payee: 'Market' },
  { id: 't-coffee', date: '2026-03-03', categoryId: 'c-eating-out', accountId: 'a-everyday', spent: '100000' },
  { id: 't-food', date: '2026-03-04', categoryId: 'c-food', accountId: 'a-card', spent: '200000' },
  { id: 't-bus', date: '2026-03-05', categoryId: 'c-transport', accountId: 'a-card', spent: '200000' },
  { id: 't-rent', date: '2026-02-05', categoryId: 'c-transport', accountId: 'a-card', spent: '300000' },
]

function setUp(expenses: FakeExpense[] = march) {
  fakeCategoriesApi()
  fakeAccountsApi([
    { id: 'a-everyday', name: 'Everyday' },
    { id: 'a-card', name: 'Card' },
  ])
  return fakeReportsApi({ expenses })
}

const table = () => screen.findByRole('table', { name: 'Spending by category' })
const rowsOf = async () =>
  within(await table())
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent))

describe('the spending by category report', () => {
  it('shows this month by default, the expense total and each category ranked with its share, in the base currency', async () => {
    const api = setUp([...march, { id: 't-now', date: thisMonth.from, categoryId: 'c-transport', spent: '150000' }])
    renderApp(`${report}?view=table`)

    expect(await screen.findByRole('heading', { level: 1, name: 'Reports' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Spending by category' })).toBeInTheDocument()
    expect(await rowsOf()).toEqual([['Transport', '₫150,000', '100%']])
    expect(api.reportsAsked.at(-1)).toEqual({ from: thisMonth.from, to: thisMonth.to })
    expect(screen.getByText('Total spent').parentElement).toHaveTextContent('Total spent₫150,000')
  })

  it('ranks the categories of a custom period by what they spent', async () => {
    setUp()
    renderApp(`${report}?period=custom&from=2026-03-01&to=2026-03-31&view=table`)

    expect(await rowsOf()).toEqual([
      ['Food & drink', '₫800,000', '80%'],
      ['Transport', '₫200,000', '20%'],
    ])
    expect(screen.getByText('Total spent').parentElement).toHaveTextContent('Total spent₫1,000,000')
  })

  it('shows the same numbers as a donut with a legend, or as a table, and keeps the choice in the address', async () => {
    setUp()
    const { user, router } = renderApp(`${report}?period=custom&from=2026-03-01&to=2026-03-31`)

    expect(await screen.findByRole('img', { name: 'Spending by category: All categories' })).toBeInTheDocument()
    const legend = screen.getByRole('list', { name: 'Categories' })
    expect(within(legend).getAllByRole('button').map((item) => item.textContent)).toEqual(['Food & drink₫800,00080%', 'Transport₫200,00020%'])
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Table' }))

    expect(await rowsOf()).toHaveLength(2)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(new URLSearchParams(router.state.location.search).get('view')).toBe('table')
  })

  it('keeps the period and filters in the address, so a report view can be bookmarked', async () => {
    const api = setUp()
    const { user, router } = renderApp(report)
    const search = () => Object.fromEntries(new URLSearchParams(router.state.location.search))
    const filters = await screen.findByRole('search', { name: 'Report filters' })
    await within(filters).findByRole('option', { name: 'Card' })
    await within(filters).findByRole('option', { name: 'Food & drink' })

    await user.selectOptions(within(filters).getByRole('combobox', { name: 'Period' }), 'Last 3 months')
    await user.selectOptions(within(filters).getByRole('combobox', { name: 'Account' }), 'Card')
    await user.selectOptions(within(filters).getByRole('combobox', { name: 'Category' }), 'c-food')
    await user.click(within(filters).getByRole('checkbox', { name: 'Compare with the previous period' }))

    const last3Months = periodOf('last3Months', todayIn(testUser.timeZone))
    expect(search()).toEqual({ period: 'last3Months', accountId: 'a-card', categoryId: 'c-food', compare: 'true' })
    await waitFor(() => expect(api.reportsAsked.at(-1)).toEqual({ ...last3Months, accountId: 'a-card', categoryId: 'c-food', compare: 'true' }))
    expect(within(filters).getByLabelText('From')).toHaveValue(last3Months.from)
    expect(within(filters).getByLabelText('To')).toHaveValue(last3Months.to)
  })

  it('offers only expense categories to filter by, each subcategory after its parent', async () => {
    setUp()
    renderApp(report)

    const category = within(await screen.findByRole('search', { name: 'Report filters' })).getByRole('combobox', { name: 'Category' })
    await waitFor(() => expect(within(category).getAllByRole('option')).toHaveLength(5))
    expect(within(category).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'All categories',
      'Food & drink',
      'Food & drink › Groceries',
      'Food & drink › Eating out',
      'Transport',
    ])
  })

  it('takes dates the user chooses as a custom period', async () => {
    const api = setUp()
    const { user, router } = renderApp(`${report}?view=table`)
    const filters = await screen.findByRole('search', { name: 'Report filters' })

    await user.selectOptions(within(filters).getByRole('combobox', { name: 'Period' }), 'Custom dates')
    expect(Object.fromEntries(new URLSearchParams(router.state.location.search))).toEqual({ view: 'table', period: 'custom', ...thisMonth })

    await user.clear(within(filters).getByLabelText('From'))
    await user.type(within(filters).getByLabelText('From'), '2026-03-01')
    await user.clear(within(filters).getByLabelText('To'))
    await user.type(within(filters).getByLabelText('To'), '2026-03-31')

    await waitFor(() => expect(api.reportsAsked.at(-1)).toEqual({ from: '2026-03-01', to: '2026-03-31' }))
    expect(await rowsOf()).toHaveLength(2)
  })

  it('opens a bookmarked view as it was, and leaves out what the address holds that is not a filter', async () => {
    const api = setUp()
    renderApp(`${report}?period=lastYear&accountId=a-card&compare=true&view=table`)

    const lastYear = periodOf('lastYear', todayIn(testUser.timeZone))
    await waitFor(() => expect(api.reportsAsked.at(-1)).toEqual({ ...lastYear, accountId: 'a-card', compare: 'true' }))
    expect(await screen.findByText('Nothing was spent in this period.')).toBeInTheDocument()
    cleanup()

    renderApp(`${report}?period=someday&from=2026-13-01&to=2026-03-31`)
    await waitFor(() => expect(api.reportsAsked.at(-1)).toEqual(thisMonth))
  })
})

describe('drilling down', () => {
  it('goes from a category to its subcategories, then to the transactions that make up its spending', async () => {
    setUp()
    const { user } = renderApp(`${report}?period=custom&from=2026-03-01&to=2026-03-31&view=table`)

    await user.click(within(await table()).getByRole('button', { name: 'Food & drink' }))

    const steps = await screen.findByRole('navigation', { name: 'Drill-down' })
    expect(within(steps).getByRole('button', { name: 'All categories' })).toBeInTheDocument()
    expect(within(steps).getByText('Food & drink')).toHaveAttribute('aria-current', 'page')
    await waitFor(async () =>
      expect(await rowsOf()).toEqual([
        ['Groceries', '₫500,000', '62.5%'],
        ['Food & drink (no subcategory)', '₫200,000', '25%'],
        ['Eating out', '₫100,000', '12.5%'],
      ]),
    )

    await user.click(within(await table()).getByRole('button', { name: 'Groceries' }))

    const transactions = await screen.findByRole('table', { name: 'Transactions in Groceries' })
    expect(within(transactions).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent))).toEqual([
      ['Mar 2, 2026', 'Market', 'Everyday', '₫500,000', '₫500,000'],
    ])
    expect(screen.getByText('Total spent').parentElement).toHaveTextContent('Total spent₫500,000')

    await user.click(within(screen.getByRole('navigation', { name: 'Drill-down' })).getByRole('button', { name: 'Food & drink' }))
    expect(await rowsOf()).toHaveLength(3)
    await user.click(within(screen.getByRole('navigation', { name: 'Drill-down' })).getByRole('button', { name: 'All categories' }))
    expect(await rowsOf()).toHaveLength(2)
  })

  it('goes straight to the transactions of a category whose subcategories spent nothing, and Back goes up a step', async () => {
    setUp()
    const { user, router } = renderApp(`${report}?period=custom&from=2026-03-01&to=2026-03-31`)

    await user.click(within(await screen.findByRole('list', { name: 'Categories' })).getByRole('button', { name: /Transport/ }))

    expect(await screen.findByRole('table', { name: 'Transactions in Transport' })).toBeInTheDocument()
    await router.navigate(-1)
    expect(await screen.findByRole('list', { name: 'Categories' })).toBeInTheDocument()
  })

  it('shows what each part of a split and each refund spent in the category, adding up to its total', async () => {
    setUp([
      { id: 't-split', date: '2026-03-04', categoryId: 'c-groceries', spent: '100000', amount: '100000', payee: 'Mart' },
      { id: 't-split', date: '2026-03-04', categoryId: 'c-transport', spent: '50000', amount: '50000', payee: 'Mart' },
      { id: 't-back', date: '2026-03-05', categoryId: 'c-groceries', spent: '-30000', amount: '30000', isRefund: true, payee: 'Mart' },
    ])
    renderApp(`${report}?period=custom&from=2026-03-01&to=2026-03-31&parentId=c-food&transactionsOf=c-groceries`)

    const transactions = await screen.findByRole('table', { name: 'Transactions in Groceries' })
    expect(within(transactions).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent))).toEqual([
      ['Mar 5, 2026', 'MartRefund', 'Everyday', '₫30,000', '-₫30,000'],
      ['Mar 4, 2026', 'MartSplit transaction', 'Everyday', '₫100,000', '₫100,000'],
    ])
    expect(screen.getByText('Total spent').parentElement).toHaveTextContent('Total spent₫70,000')
  })
})

describe('comparing and what is left out', () => {
  it('compares each category with what it spent in the previous period', async () => {
    setUp()
    renderApp(`${report}?period=custom&from=2026-03-01&to=2026-03-31&compare=true&view=table`)

    expect(await rowsOf()).toEqual([
      ['Food & drink', '₫800,000', '80%', '₫0'],
      ['Transport', '₫200,000', '20%', '₫300,000'],
    ])
    expect(screen.getByRole('columnheader', { name: 'Previous period' })).toBeInTheDocument()
    expect(screen.getByText('Previous period, Feb 1, 2026 to Feb 28, 2026').parentElement).toHaveTextContent('₫300,000')
  })

  it('flags amounts that are not converted instead of dropping them silently', async () => {
    setUp([
      { id: 't-market', date: '2026-03-02', categoryId: 'c-groceries', spent: '500000' },
      { id: 't-abroad', date: '2026-03-03', categoryId: 'c-groceries', spent: null, amount: '40.00', currency: 'USD' },
    ])
    renderApp(`${report}?period=custom&from=2026-03-01&to=2026-03-31&view=table`)

    expect(await rowsOf()).toEqual([['Food & drink', '₫500,0001 not converted', '100%']])
    expect(screen.getByText('1 amount is not converted into your base currency yet and is left out.')).toHaveAttribute('role', 'note')
  })

  it('says when nothing was spent, and when the report cannot be loaded', async () => {
    const api = setUp([])
    renderApp(`${report}?period=custom&from=2026-03-01&to=2026-03-31`)
    expect(await screen.findByText('Nothing was spent in this period.')).toBeInTheDocument()

    api.failWith = 500
    renderApp(`${report}?period=custom&from=2026-04-01&to=2026-04-30`)
    expect(await screen.findByRole('alert')).toHaveTextContent('The report could not be loaded.')
  })
})

