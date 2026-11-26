import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeAccountsApi } from '@/test/fakeAccountsApi'
import { defaultTestCategories, fakeCategoriesApi } from '@/test/fakeCategoriesApi'
import { fakeInstitutionsApi } from '@/test/fakeInstitutionsApi'
import { fakeReconciliationsApi } from '@/test/fakeReconciliationsApi'
import { fakeTransactionsApi } from '@/test/fakeTransactionsApi'
import { renderApp } from '@/test/renderApp'

const everyday = '01970000-0000-7000-8000-200000000000'
const savings = '01970000-0000-7000-8000-200000000001'

/** October on Everyday, which opened with 1,000,000: its statement closes at 5,500,000. */
const october: Parameters<typeof fakeTransactionsApi>[0] = [
  { type: 'income', accountId: everyday, amount: '5000000.00', date: '2026-10-05', categoryId: 'c-salary', payee: 'Salary' },
  { type: 'expense', accountId: everyday, amount: '500000.00', date: '2026-10-20', categoryId: 'c-groceries', payee: 'Co.op Mart' },
  { type: 'expense', accountId: everyday, amount: '1000.00', date: '2026-11-02', categoryId: 'c-groceries', payee: 'After the statement' },
  { type: 'expense', accountId: savings, amount: '2000.00', date: '2026-10-05', categoryId: 'c-groceries', payee: 'On savings' },
]

function fakeApis(transactions = october) {
  fakeInstitutionsApi()
  const accountsApi = fakeAccountsApi([{ name: 'Everyday', openingBalance: '1000000.00' }, { name: 'Savings' }])
  const categoriesApi = fakeCategoriesApi({ categories: defaultTestCategories })
  const transactionsApi = fakeTransactionsApi(transactions, { accounts: accountsApi.accounts, categories: categoriesApi.categories })
  const reconciliationsApi = fakeReconciliationsApi({ accounts: accountsApi.accounts, transactions: transactionsApi.transactions })
  return { transactionsApi, reconciliationsApi }
}

async function startOctober(user: ReturnType<typeof renderApp>['user']) {
  await user.type(await screen.findByLabelText('Statement date'), '2026-10-31')
  await user.type(screen.getByLabelText('Closing balance (VND)'), '5,500,000')
  await user.click(screen.getByRole('button', { name: 'Start reconciliation' }))
}

const difference = () => screen.getByTestId('difference')

describe('reconciling an account', () => {
  it('is opened from the account, and started with the statement date and closing balance', async () => {
    const { reconciliationsApi } = fakeApis()
    const { user } = renderApp('/accounts')

    await user.click(await screen.findByRole('link', { name: 'Reconcile Everyday' }, { timeout: 5000 }))
    expect(await screen.findByRole('heading', { name: 'Reconcile Everyday' })).toBeInTheDocument()
    await startOctober(user)

    await waitFor(() => expect(reconciliationsApi.startRequests).toEqual([{ statementDate: '2026-10-31', statementBalance: '5500000' }]))
    // Measured from the opening balance: 5,500,000 − 1,000,000, with nothing ticked yet.
    await waitFor(() => expect(difference()).toHaveTextContent('4,500,000'))
  })

  it('refuses a statement date in the future or no closing balance before the API is contacted', async () => {
    const { reconciliationsApi } = fakeApis()
    const { user } = renderApp(`/accounts/${everyday}/reconcile`)

    await user.type(await screen.findByLabelText('Statement date'), '2999-01-01')
    await user.click(screen.getByRole('button', { name: 'Start reconciliation' }))

    expect(await screen.findByText('A statement date cannot be in the future.')).toBeInTheDocument()
    expect(screen.getByText('Enter the closing balance.')).toBeInTheDocument()
    expect(reconciliationsApi.startRequests).toEqual([])
  })

  it('lists the account’s transactions up to the statement date, and ticking them moves the difference towards zero', async () => {
    fakeApis()
    const { user } = renderApp(`/accounts/${everyday}/reconcile`)
    await startOctober(user)

    const list = within(await screen.findByRole('list', { name: 'Transactions to tick' }))
    expect(list.getAllByRole('checkbox').map((box) => box.getAttribute('aria-label'))).toEqual(['Tick Salary', 'Tick Co.op Mart'])

    await user.click(list.getByRole('checkbox', { name: 'Tick Salary' }))
    await waitFor(() => expect(difference()).toHaveTextContent('-₫500,000'))
    expect(screen.getByRole('button', { name: 'Complete reconciliation' })).toBeDisabled()
    expect(screen.getByText('It can be completed once the difference is exactly zero.')).toBeInTheDocument()

    await user.click(list.getByRole('checkbox', { name: 'Tick Co.op Mart' }))
    await waitFor(() => expect(difference()).toHaveTextContent(/^Difference\s*₫?0\s*₫?$/))
    expect(screen.getByRole('button', { name: 'Complete reconciliation' })).toBeEnabled()

    await user.click(list.getByRole('checkbox', { name: 'Tick Co.op Mart' }))
    await waitFor(() => expect(difference()).toHaveTextContent('-₫500,000'))
  })

  it('completes only at a difference of zero, and locks the ticked transactions', async () => {
    const { transactionsApi } = fakeApis()
    const { user } = renderApp(`/accounts/${everyday}/reconcile`)
    await startOctober(user)
    await user.click(await screen.findByRole('checkbox', { name: 'Tick Salary' }))
    await user.click(screen.getByRole('checkbox', { name: 'Tick Co.op Mart' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Complete reconciliation' })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'Complete reconciliation' }))

    expect(await screen.findByText('Reconciled to Oct 31, 2026. Its transactions are locked.')).toBeInTheDocument()
    expect(transactionsApi.transactions.map((transaction) => transaction.isReconciled)).toEqual([true, true, false, false])
    // No adjustment is ever added.
    expect(transactionsApi.transactions).toHaveLength(4)
    // The next statement can be started.
    expect(screen.getByLabelText('Statement date')).toBeInTheDocument()
  })

  it('reopens a completed reconciliation, which unlocks its transactions and keeps them ticked', async () => {
    const { transactionsApi } = fakeApis()
    const { user } = renderApp(`/accounts/${everyday}/reconcile`)
    await startOctober(user)
    await user.click(await screen.findByRole('checkbox', { name: 'Tick Salary' }))
    await user.click(screen.getByRole('checkbox', { name: 'Tick Co.op Mart' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Complete reconciliation' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Complete reconciliation' }))

    await user.click(await screen.findByRole('button', { name: 'Reopen' }))

    expect(await screen.findByRole('checkbox', { name: 'Tick Salary' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Tick Co.op Mart' })).toBeChecked()
    expect(transactionsApi.transactions.map((transaction) => transaction.isReconciled)).toEqual([false, false, false, false])
  })

  it('cancels a reconciliation in progress, so another statement can be entered', async () => {
    const { reconciliationsApi } = fakeApis()
    const { user } = renderApp(`/accounts/${everyday}/reconcile`)
    await startOctober(user)
    await user.click(await screen.findByRole('checkbox', { name: 'Tick Salary' }))

    await user.click(screen.getByRole('button', { name: 'Cancel reconciliation' }))

    expect(await screen.findByLabelText('Statement date')).toBeInTheDocument()
    expect(reconciliationsApi.reconciliations).toEqual([])
  })
})
