import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeAccountsApi } from '@/test/fakeAccountsApi'
import { fakeCategoriesApi } from '@/test/fakeCategoriesApi'
import { fakeReportsApi, type FakeHolding } from '@/test/fakeReportsApi'
import { renderApp } from '@/test/renderApp'

const report = '/reports/net-worth'
const firstQuarter = 'period=custom&from=2026-01-01&to=2026-03-31'

/** An everyday account, a credit card owing more each month, and a loan taken out in February. */
const holdings: FakeHolding[] = [
  { accountId: 'a-everyday', from: '2026-01-01', balance: '1000000' },
  { accountId: 'a-everyday', from: '2026-02-10', balance: '3000000' },
  {
    accountId: 'a-visa',
    from: '2026-01-01',
    balance: '-300000',
    holdsAmountOwed: true,
  },
  {
    accountId: 'a-visa',
    from: '2026-03-05',
    balance: '-200000',
    holdsAmountOwed: true,
  },
  {
    accountId: 'a-loan',
    from: '2026-02-15',
    balance: '-5000000',
    holdsAmountOwed: true,
  },
]

function setUp(held: FakeHolding[] = holdings) {
  fakeCategoriesApi()
  fakeAccountsApi([
    { id: 'a-everyday', name: 'Everyday' },
    { id: 'a-visa', name: 'Visa' },
  ])
  return fakeReportsApi({ holdings: held })
}

const table = () => screen.findByRole('table', { name: 'Net worth at each month end' })
const rowsOf = async () =>
  within(await table())
    .getAllByRole('row')
    .slice(1)
    .map((row) => [...within(row).getAllByRole('rowheader'), ...within(row).getAllByRole('cell')].map((cell) => cell.textContent))

describe('the net worth report', () => {
  it('shows the assets, the liabilities and what they leave at each month end, credit cards and loans as liabilities', async () => {
    const api = setUp()
    renderApp(`${report}?${firstQuarter}&view=table`)

    expect(await screen.findByRole('heading', { level: 2, name: 'Net worth' })).toBeInTheDocument()
    expect(await rowsOf()).toEqual([
      ['Jan 31, 2026', '₫1,000,000', '₫300,000', '₫700,000'],
      ['Feb 28, 2026', '₫3,000,000', '₫5,300,000', '-₫2,300,000'],
      ['Mar 31, 2026', '₫3,000,000', '₫5,200,000', '-₫2,200,000'],
    ])
    expect(api.netWorthAsked.at(-1)).toEqual({
      from: '2026-01-01',
      to: '2026-03-31',
    })
    expect(screen.getByText('Net worth on Mar 31, 2026').parentElement).toHaveTextContent('-₫2,200,000')
  })

  it('draws the assets and liabilities as stacked areas, with the same numbers in the table view', async () => {
    setUp()
    const { user } = renderApp(`${report}?${firstQuarter}`)

    expect(
      await screen.findByRole('img', {
        name: 'Net worth: assets and liabilities at each month end',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Table' }))
    expect(await rowsOf()).toHaveLength(3)
  })

  it('narrows down to one account, and offers no category filter or comparison', async () => {
    const api = setUp()
    renderApp(`${report}?${firstQuarter}&accountId=a-visa&categoryId=c-food&compare=true&view=table`)

    expect((await rowsOf())[0]).toEqual(['Jan 31, 2026', '₫0', '₫300,000', '-₫300,000'])
    expect(api.netWorthAsked.at(-1)).toEqual({
      from: '2026-01-01',
      to: '2026-03-31',
      accountId: 'a-visa',
    })
    const filters = screen.getByRole('search', { name: 'Report filters' })
    expect(within(filters).queryByRole('combobox', { name: 'Category' })).not.toBeInTheDocument()
    expect(within(filters).queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('ends on the last day of a period that ends inside a month', async () => {
    setUp()
    renderApp(`${report}?period=custom&from=2026-01-15&to=2026-02-10&view=table`)

    expect((await rowsOf()).map((row) => row[0])).toEqual(['Jan 31, 2026', 'Feb 10, 2026'])
  })

  it('flags balances that are not converted, and says when the report cannot be loaded', async () => {
    const api = setUp([...holdings, { accountId: 'a-dollars', from: '2026-01-01', balance: null }])
    renderApp(`${report}?period=custom&from=2026-01-01&to=2026-01-31&view=table`)

    expect((await rowsOf())[0]).toEqual(['Jan 31, 2026', '₫1,000,000', '₫300,000', '₫700,0001 not converted'])
    expect(screen.getByText('1 amount is not converted into your base currency yet and is left out.')).toBeInTheDocument()

    api.failWith = 500
    renderApp(`${report}?period=custom&from=2026-04-01&to=2026-04-30`)
    expect(await screen.findByRole('alert')).toHaveTextContent('The report could not be loaded.')
  })
})
