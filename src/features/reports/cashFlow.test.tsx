import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeAccountsApi } from '@/test/fakeAccountsApi'
import { fakeCategoriesApi } from '@/test/fakeCategoriesApi'
import { fakeReportsApi, type FakeHolding } from '@/test/fakeReportsApi'
import { renderApp } from '@/test/renderApp'

const report = '/reports/cash-flow'
const firstWeek = 'period=custom&from=2026-03-01&to=2026-03-04'

/** Everyday, a salary on the 2nd and rent on the 4th, and dollars converted from the 1st. */
const holdings: FakeHolding[] = [
  { accountId: 'a-everyday', from: '2026-01-01', balance: '1000000' },
  { accountId: 'a-everyday', from: '2026-03-02', balance: '6000000' },
  { accountId: 'a-everyday', from: '2026-03-04', balance: '1000000' },
  { accountId: 'a-dollars', from: '2026-01-01', balance: '250000', currency: 'USD', ownBalance: '10' },
]

function setUp(held: FakeHolding[] = holdings) {
  fakeCategoriesApi()
  fakeAccountsApi([
    { id: 'a-everyday', name: 'Everyday' },
    { id: 'a-dollars', name: 'Dollars', currency: 'USD' },
  ])
  return fakeReportsApi({ holdings: held })
}

const table = () => screen.findByRole('table', { name: 'Running balance' })
const rowsOf = async () =>
  within(await table())
    .getAllByRole('row')
    .slice(1)
    .map((row) => [...within(row).getAllByRole('rowheader'), ...within(row).getAllByRole('cell')].map((cell) => cell.textContent))

describe('the cash flow report', () => {
  it('shows the running balance of all accounts at the end of every day, in the base currency', async () => {
    const api = setUp()
    renderApp(`${report}?${firstWeek}&view=table`)

    expect(await screen.findByRole('heading', { level: 2, name: 'Cash flow' })).toBeInTheDocument()
    expect(await rowsOf()).toEqual([
      ['Mar 1, 2026', '₫1,250,000'],
      ['Mar 2, 2026', '₫6,250,000'],
      ['Mar 3, 2026', '₫6,250,000'],
      ['Mar 4, 2026', '₫1,250,000'],
    ])
    expect(api.cashFlowAsked.at(-1)).toEqual({ from: '2026-03-01', to: '2026-03-04' })
    expect(screen.getByText('Balance on Mar 4, 2026').parentElement).toHaveTextContent('₫1,250,000')
  })

  it('draws the running balance as a line, with the same numbers in the table view', async () => {
    setUp()
    const { user } = renderApp(`${report}?${firstWeek}`)

    expect(await screen.findByRole('img', { name: 'Cash flow: the running balance over the period' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Table' }))
    expect(await rowsOf()).toHaveLength(4)
  })

  it('shows the balance at the end of every week once weekly is chosen, and keeps that in the address', async () => {
    const api = setUp()
    const { user, router } = renderApp(`${report}?period=custom&from=2026-03-02&to=2026-03-18&view=table`)

    await user.click(await screen.findByRole('radio', { name: 'Weekly' }))

    await waitFor(() => expect(api.cashFlowAsked.at(-1)).toEqual({ from: '2026-03-02', to: '2026-03-18', interval: 'week' }))
    expect((await rowsOf()).map((row) => row[0])).toEqual(['Mar 8, 2026', 'Mar 15, 2026', 'Mar 18, 2026'])
    expect(router.state.location.search).toContain('interval=week')
  })

  it('shows one account in its own currency, and offers no category filter or comparison', async () => {
    const api = setUp()
    renderApp(`${report}?${firstWeek}&accountId=a-dollars&categoryId=c-food&compare=true&view=table`)

    expect((await rowsOf())[0]).toEqual(['Mar 1, 2026', '$10.00'])
    expect(api.cashFlowAsked.at(-1)).toEqual({ from: '2026-03-01', to: '2026-03-04', accountId: 'a-dollars' })
    const filters = screen.getByRole('search', { name: 'Report filters' })
    expect(within(filters).queryByRole('combobox', { name: 'Category' })).not.toBeInTheDocument()
    expect(within(filters).queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('flags balances that are not converted, and says when the report cannot be loaded', async () => {
    const api = setUp([...holdings, { accountId: 'a-euros', from: '2026-01-01', balance: null }])
    renderApp(`${report}?period=custom&from=2026-03-01&to=2026-03-01&view=table`)

    expect((await rowsOf())[0]).toEqual(['Mar 1, 2026', '₫1,250,0001 not converted'])
    expect(screen.getByText('1 amount is not converted into your base currency yet and is left out.')).toBeInTheDocument()

    api.failWith = 500
    renderApp(`${report}?period=custom&from=2026-04-01&to=2026-04-30`)
    expect(await screen.findByRole('alert')).toHaveTextContent('The report could not be loaded.')
  })
})
