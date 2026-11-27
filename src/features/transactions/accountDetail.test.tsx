import { screen, within } from '@testing-library/react'
import { http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeAccountsApi } from '@/test/fakeAccountsApi'
import { defaultTestCategories, fakeCategoriesApi } from '@/test/fakeCategoriesApi'
import { fakeInstitutionsApi } from '@/test/fakeInstitutionsApi'
import { fakeReportsApi } from '@/test/fakeReportsApi'
import { fakeTransactionsApi } from '@/test/fakeTransactionsApi'
import { renderApp } from '@/test/renderApp'
import { apiUrl, problem, server } from '@/test/server'

const everyday = '01970000-0000-7000-8000-200000000000'
const savings = '01970000-0000-7000-8000-200000000001'
const old = '01970000-0000-7000-8000-200000000002'

function fakeApis() {
  fakeInstitutionsApi()
  const accountsApi = fakeAccountsApi([
    { name: 'Everyday', openingBalance: '1000000.00', balance: '5500000.00' },
    { name: 'Savings' },
    { name: 'Old wallet', isArchived: true },
  ])
  const categoriesApi = fakeCategoriesApi({ categories: defaultTestCategories })
  fakeTransactionsApi(
    [
      { type: 'income', accountId: everyday, amount: '5000000.00', date: '2026-11-05', categoryId: 'c-salary', payee: 'Salary' },
      { type: 'expense', accountId: everyday, amount: '500000.00', date: '2026-11-10', categoryId: 'c-groceries', payee: 'Co.op Mart' },
      { type: 'expense', accountId: savings, amount: '2000.00', date: '2026-11-06', categoryId: 'c-groceries', payee: 'On savings' },
    ],
    { accounts: accountsApi.accounts, categories: categoriesApi.categories },
  )
  return fakeReportsApi({
    holdings: [
      { accountId: everyday, from: '2026-01-01', balance: '1000000' },
      { accountId: everyday, from: '2026-11-05', balance: '6000000' },
      { accountId: everyday, from: '2026-11-10', balance: '5500000' },
    ],
  })
}

describe('the account detail page', () => {
  beforeEach(() => {
    // Only the date is fixed, so today is 20 November in the user's time zone; timers run as usual.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-20T03:00:00Z'))
  })

  afterEach(() => vi.useRealTimers())

  it('is opened from the accounts screen, and shows the account with its balance over the last 90 days and its transactions', async () => {
    const reportsApi = fakeApis()
    const { user } = renderApp('/accounts')

    await user.click(await screen.findByRole('link', { name: 'Everyday' }, { timeout: 5000 }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Everyday' })).toBeInTheDocument()
    expect(await screen.findByTestId('balance')).toHaveTextContent('₫5,500,000')
    expect(await screen.findByRole('img', { name: 'Balance of Everyday over the last 90 days' })).toBeInTheDocument()
    expect(reportsApi.cashFlowAsked.at(-1)).toEqual({ from: '2026-08-23', to: '2026-11-20', accountId: everyday })
    const list = within(await screen.findByRole('list', { name: 'Transactions on Everyday' }))
    expect(list.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(['Co.op Mart', 'Salary'])
  })

  it('shows the same balances as a table', async () => {
    fakeApis()
    const { user } = renderApp(`/accounts/${everyday}`)

    await user.click(await screen.findByRole('radio', { name: 'Table' }))

    const rows = within(await screen.findByRole('table', { name: 'Running balance' })).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(90)
    expect(rows.at(-1)).toHaveTextContent('Nov 20, 2026₫5,500,000')
  })

  it('leads on to reconciling the account, to all its transactions and to its cash flow report', async () => {
    fakeApis()
    renderApp(`/accounts/${everyday}`)

    expect(await screen.findByRole('link', { name: 'Reconcile Everyday' })).toHaveAttribute('href', `/accounts/${everyday}/reconcile`)
    expect(screen.getByRole('link', { name: 'All transactions on Everyday' })).toHaveAttribute('href', `/transactions?accountId=${everyday}`)
    expect(screen.getByRole('link', { name: 'Cash flow of Everyday' })).toHaveAttribute('href', `/reports/cash-flow?accountId=${everyday}`)
  })

  it('edits one of its transactions in a drawer', async () => {
    fakeApis()
    const { user } = renderApp(`/accounts/${everyday}`)

    await user.click(await screen.findByRole('button', { name: 'Edit Salary' }))

    expect(await screen.findByRole('dialog', { name: 'Edit transaction' })).toBeInTheDocument()
  })

  it('offers no reconciling for an archived account', async () => {
    fakeApis()
    renderApp(`/accounts/${old}`)

    expect(await screen.findByRole('heading', { level: 1, name: 'Old wallet' }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByText('Archived')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Reconcile Old wallet' })).not.toBeInTheDocument()
  })

  it('says when its transactions could not be loaded, and still shows the account', async () => {
    fakeApis()
    server.use(http.get(apiUrl('/api/v1/categories'), () => problem(500)))
    renderApp(`/accounts/${everyday}`)

    expect(await screen.findByText("The account's transactions could not be loaded.", {}, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Everyday' })).toBeInTheDocument()
  })

  it('says when there is no such account', async () => {
    fakeApis()
    renderApp('/accounts/01970000-0000-7000-8000-2000000000ff')

    expect(await screen.findByText('There is no such account.', {}, { timeout: 5000 })).toBeInTheDocument()
  })
})
