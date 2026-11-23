import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeAccountsApi } from '@/test/fakeAccountsApi'
import { defaultTestCategories, fakeCategoriesApi } from '@/test/fakeCategoriesApi'
import { fakeInstitutionsApi } from '@/test/fakeInstitutionsApi'
import { fakeTransactionsApi } from '@/test/fakeTransactionsApi'
import { renderApp } from '@/test/renderApp'

const everyday = '01970000-0000-7000-8000-200000000000'
const savings = '01970000-0000-7000-8000-200000000001'
const dollars = '01970000-0000-7000-8000-200000000002'

/** Today in the test user's time zone, which is as late as a transfer can be dated. */
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

const threeAccounts: Parameters<typeof fakeAccountsApi>[0] = [
  { name: 'Everyday', openingBalance: '5000000.00' },
  { name: 'Savings', openingBalance: '1000000.00' },
  { name: 'US dollars', currency: 'USD', openingBalance: '10.00' },
]

/** The two legs of one transfer of 2,000,000 dong from Everyday to Savings, as the API lists them. */
const toSavings: Parameters<typeof fakeTransactionsApi>[0] = [
  { type: 'transferOut', accountId: everyday, amount: '2000000.00', date: '2026-11-02', transferId: 't-1', note: 'for Tet', rowVersion: '7' },
  { type: 'transferIn', accountId: savings, amount: '2000000.00', date: '2026-11-02', transferId: 't-1', note: 'for Tet', rowVersion: '7' },
]

function fakeApis(transactions: Parameters<typeof fakeTransactionsApi>[0] = [], accounts: Parameters<typeof fakeAccountsApi>[0] = threeAccounts) {
  fakeInstitutionsApi()
  const accountsApi = fakeAccountsApi(accounts)
  const categoriesApi = fakeCategoriesApi({ categories: defaultTestCategories })
  const transactionsApi = fakeTransactionsApi(transactions, { accounts: accountsApi.accounts, categories: categoriesApi.categories, today })
  return { accountsApi, transactionsApi }
}

/** Each listed transaction: what it is headed by, the line under it, and its amount; read whether or not the drawer is open over the list. */
function listed(name = 'Transactions') {
  return within(screen.getByRole('list', { name, hidden: true }))
    .getAllByRole('listitem', { hidden: true })
    .map((item) => [
      within(item).getByRole('heading', { hidden: true }).textContent,
      within(item).getByTestId('details').textContent,
      within(item).getByTestId('amount').textContent,
    ])
}

describe('transfers', () => {
  it('show both legs in the transaction list, each marked as a transfer on its own account, with the sign of its type', async () => {
    fakeApis([...toSavings, { type: 'expense', accountId: everyday, amount: '45000.00', date: '2026-10-28', categoryId: 'c-transport' }])
    renderApp('/transactions')

    await screen.findByRole('list', { name: 'Transactions' })
    expect(listed()).toEqual([
      ['Transfer in', 'Transfer · Savings · Nov 2, 2026', '₫2,000,000'],
      ['Transfer out', 'Transfer · Everyday · Nov 2, 2026', '-₫2,000,000'],
      ['Transport', 'Transport · Everyday · Oct 28, 2026', '-₫45,000'],
    ])
    expect(screen.getAllByTestId('transfer-mark')).toHaveLength(2)
  })

  it('are recorded in the drawer between two accounts in one currency, with one amount, and both legs join the list', async () => {
    const { transactionsApi } = fakeApis()
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('button', { name: 'Transfer between accounts' }))
    const drawer = within(screen.getByRole('dialog', { name: 'New transfer' }))
    expect(drawer.getByLabelText('From account')).toHaveDisplayValue('Everyday (VND)')
    expect(drawer.getByLabelText('To account')).toHaveDisplayValue('Savings (VND)')
    expect(drawer.getByLabelText('Date')).toHaveValue(today)
    expect(drawer.queryByLabelText(/Amount that arrives/)).not.toBeInTheDocument()
    await user.type(drawer.getByLabelText('Amount (VND)'), '2,000,000')
    await user.clear(drawer.getByLabelText('Date'))
    await user.type(drawer.getByLabelText('Date'), '2026-11-02')
    await user.type(drawer.getByLabelText('Note'), 'for Tet')
    await user.click(drawer.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(transactionsApi.transferRequests).toEqual([
      { method: 'POST', body: { fromAccountId: everyday, toAccountId: savings, amount: '2000000', toAmount: null, date: '2026-11-02', note: 'for Tet' } },
    ])
    expect(transactionsApi.idempotencyKeys).toEqual([expect.any(String)])
    // The two legs are recorded at the same moment, so which comes first is not said.
    await waitFor(() =>
      expect(listed().toSorted()).toEqual([
        ['Transfer in', 'Transfer · Savings · Nov 2, 2026', '₫2,000,000'],
        ['Transfer out', 'Transfer · Everyday · Nov 2, 2026', '-₫2,000,000'],
      ]),
    )
    expect(screen.getAllByText('for Tet')).toHaveLength(2)
  })

  it('ask for both amounts between accounts in different currencies, and send them as entered', async () => {
    const { transactionsApi } = fakeApis()
    const { user } = renderApp('/transactions')
    await user.click(await screen.findByRole('button', { name: 'Transfer between accounts' }))
    const drawer = within(screen.getByRole('dialog', { name: 'New transfer' }))

    await user.selectOptions(drawer.getByLabelText('To account'), 'US dollars (USD)')
    expect(drawer.getByText('These accounts are in different currencies, so enter both amounts. No exchange rate is looked up.')).toBeInTheDocument()
    await user.type(drawer.getByLabelText('Amount (VND)'), '2,550,000')
    await user.click(drawer.getByRole('button', { name: 'Save' }))
    expect(await drawer.findByText('Enter the amount that arrives.')).toBeInTheDocument()
    expect(transactionsApi.transferRequests).toEqual([])

    await user.type(drawer.getByLabelText('Amount that arrives (USD)'), '99.50')
    await user.click(drawer.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(transactionsApi.transferRequests.map(({ body }) => body)).toEqual([
      { fromAccountId: everyday, toAccountId: dollars, amount: '2550000', toAmount: '99.50', date: today, note: null },
    ])
    await waitFor(() => expect(listed().map(([title, , amount]) => [title, amount]).toSorted()).toEqual([['Transfer in', '$99.50'], ['Transfer out', '-₫2,550,000']]))
  })

  it('are held to the API’s rules before it is contacted: two different accounts, an amount above zero, a date not in the future', async () => {
    const { transactionsApi } = fakeApis()
    const { user } = renderApp('/transactions')
    await user.click(await screen.findByRole('button', { name: 'Transfer between accounts' }))
    const drawer = within(screen.getByRole('dialog', { name: 'New transfer' }))

    await user.selectOptions(drawer.getByLabelText('To account'), 'Everyday (VND)')
    await user.click(drawer.getByRole('button', { name: 'Save' }))
    expect(await drawer.findByText('Choose a different account from the one the money leaves.')).toBeInTheDocument()
    expect(drawer.getByText('Enter an amount.')).toBeInTheDocument()

    await user.selectOptions(drawer.getByLabelText('To account'), 'Savings (VND)')
    await user.type(drawer.getByLabelText('Amount (VND)'), '0')
    await user.clear(drawer.getByLabelText('Date'))
    await user.type(drawer.getByLabelText('Date'), '2999-01-01')
    await user.click(drawer.getByRole('button', { name: 'Save' }))

    expect(await drawer.findByText('Enter an amount greater than zero.')).toBeInTheDocument()
    expect(drawer.getByText('The date cannot be in the future.')).toBeInTheDocument()
    expect(drawer.queryByText('Choose a different account from the one the money leaves.')).not.toBeInTheDocument()
    expect(transactionsApi.transferRequests).toEqual([])
  })

  it('offer only accounts that are not archived, and need two of them', async () => {
    fakeApis([], [{ name: 'Everyday' }, { name: 'Closed', isArchived: true }])
    const first = renderApp('/transactions')
    await screen.findByRole('button', { name: 'Add transaction' })
    expect(screen.queryByRole('button', { name: 'Transfer between accounts' })).not.toBeInTheDocument()
    first.unmount()

    fakeApis([], [{ name: 'Everyday' }, { name: 'Closed', isArchived: true }, { name: 'Savings' }])
    const { user } = renderApp('/transactions')
    await user.click(await screen.findByRole('button', { name: 'Transfer between accounts' }))
    const drawer = within(screen.getByRole('dialog', { name: 'New transfer' }))

    expect(within(drawer.getByLabelText('From account')).getAllByRole('option').map((option) => option.textContent)).toEqual(['Everyday (VND)', 'Savings (VND)'])
    expect(drawer.getByLabelText('To account')).toHaveDisplayValue('Savings (VND)')
  })

  it('show under its field what the API refuses, and record nothing', async () => {
    const { accountsApi, transactionsApi } = fakeApis()
    const { user } = renderApp('/transactions')
    await user.click(await screen.findByRole('button', { name: 'Transfer between accounts' }))
    const drawer = within(screen.getByRole('dialog', { name: 'New transfer' }))
    await user.type(drawer.getByLabelText('Amount (VND)'), '100')
    // Archived somewhere else since the form was opened.
    accountsApi.accounts.find((account) => account.id === savings)!.isArchived = true
    await user.click(drawer.getByRole('button', { name: 'Save' }))

    expect(await drawer.findByText('Choose one of your accounts that is not archived.')).toBeInTheDocument()
    expect(drawer.getByLabelText('To account')).toBeInvalid()
    expect(transactionsApi.transactions).toEqual([])
  })

  it('say in a toast when saving fails, and trying again cannot record the transfer twice', async () => {
    const { transactionsApi } = fakeApis()
    const { user } = renderApp('/transactions')
    await user.click(await screen.findByRole('button', { name: 'Transfer between accounts' }))
    const drawer = within(screen.getByRole('dialog', { name: 'New transfer' }))
    await user.type(drawer.getByLabelText('Amount (VND)'), '100')
    transactionsApi.failNext()
    await user.click(drawer.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('The transfer was not saved.')).toBeInTheDocument()
    expect(transactionsApi.transactions).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(transactionsApi.transactions).toHaveLength(2))
    const [first, second] = transactionsApi.idempotencyKeys
    expect(first).toBeTruthy()
    expect(second).toBe(first)
  })

  it('open the transfer form from either leg, and an edit changes both legs, naming the row version it was made from', async () => {
    const { transactionsApi } = fakeApis(toSavings)
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('button', { name: 'Edit Transfer in' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit transfer' })
    const drawer = within(dialog)
    expect(await drawer.findByLabelText('From account')).toHaveDisplayValue('Everyday (VND)')
    expect(drawer.getByLabelText('To account')).toHaveDisplayValue('Savings (VND)')
    expect(drawer.getByLabelText('Amount (VND)')).toHaveValue('2,000,000')
    expect(drawer.getByLabelText('Date')).toHaveValue('2026-11-02')
    expect(drawer.getByLabelText('Note')).toHaveValue('for Tet')
    await user.selectOptions(drawer.getByLabelText('To account'), 'US dollars (USD)')
    await user.clear(drawer.getByLabelText('Amount (VND)'))
    await user.type(drawer.getByLabelText('Amount (VND)'), '2,550,000')
    await user.type(drawer.getByLabelText('Amount that arrives (USD)'), '100')
    await user.click(drawer.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(transactionsApi.transferRequests).toEqual([
      { method: 'PUT', body: { fromAccountId: everyday, toAccountId: dollars, amount: '2550000', toAmount: '100', date: '2026-11-02', note: 'for Tet' } },
    ])
    expect(transactionsApi.ifMatches).toEqual(['"7"'])
    await waitFor(() =>
      expect(listed()).toEqual([
        ['Transfer in', 'Transfer · US dollars · Nov 2, 2026', '$100.00'],
        ['Transfer out', 'Transfer · Everyday · Nov 2, 2026', '-₫2,550,000'],
      ]),
    )
  })

  it('show both amounts of a transfer between currencies when it is opened', async () => {
    fakeApis([
      { type: 'transferOut', accountId: everyday, amount: '2550000.00', date: '2026-11-02', transferId: 't-2' },
      { type: 'transferIn', accountId: dollars, amount: '99.50', currency: 'USD', date: '2026-11-02', transferId: 't-2' },
    ])
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('button', { name: 'Edit Transfer out' }))
    const drawer = within(await screen.findByRole('dialog', { name: 'Edit transfer' }))

    expect(await drawer.findByLabelText('Amount (VND)')).toHaveValue('2,550,000')
    expect(drawer.getByLabelText('Amount that arrives (USD)')).toHaveValue('99.50')
  })

  it('are not saved over a change made somewhere else: the latest version is shown instead', async () => {
    const { transactionsApi } = fakeApis(toSavings)
    const { user } = renderApp('/transactions')
    await user.click(await screen.findByRole('button', { name: 'Edit Transfer out' }))
    const drawer = within(await screen.findByRole('dialog', { name: 'Edit transfer' }))
    await drawer.findByLabelText('Amount (VND)')
    // Edited somewhere else since the form was opened.
    for (const leg of transactionsApi.transactions) Object.assign(leg, { amount: '3000000.00', rowVersion: '8' })
    await user.clear(drawer.getByLabelText('Amount (VND)'))
    await user.type(drawer.getByLabelText('Amount (VND)'), '1')
    await user.click(drawer.getByRole('button', { name: 'Save' }))

    expect(await drawer.findByText('This transfer was changed somewhere else since you opened it. The latest version is shown; check it and save again.')).toBeInTheDocument()
    await waitFor(() => expect(drawer.getByLabelText('Amount (VND)')).toHaveValue('3,000,000'))
    expect(transactionsApi.transactions.map((leg) => leg.amount)).toEqual(['3000000.00', '3000000.00'])
  })

  it('are deleted from either leg after the user confirms, and both legs leave the list', async () => {
    const { transactionsApi } = fakeApis([...toSavings, { type: 'expense', accountId: everyday, amount: '45000.00', date: '2026-10-28', categoryId: 'c-transport' }])
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('button', { name: 'Delete Transfer in' }))
    const confirm = within(screen.getByRole('group', { name: 'Delete Transfer in' }))
    expect(confirm.getByText('Delete this transfer? Both of its legs leave this list, and both accounts get their balance back.')).toBeInTheDocument()
    expect(transactionsApi.transactions).toHaveLength(3)
    await user.click(confirm.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(listed().map(([title]) => title)).toEqual(['Transport']))
    expect(transactionsApi.transactions.map((transaction) => transaction.type)).toEqual(['expense'])
  })

  it('move the balances of both accounts, which the accounts screen shows without being reloaded', async () => {
    fakeApis()
    const { user } = renderApp('/accounts')
    const balances = async () =>
      within(await screen.findByRole('list', { name: 'Accounts of No institution' }))
        .getAllByTestId('balance')
        .map((balance) => balance.textContent)
    const goTo = (name: string) => user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name }))
    expect(await balances()).toEqual(['₫5,000,000', '₫1,000,000', '$10.00'])

    await goTo('Transactions')
    await user.click(await screen.findByRole('button', { name: 'Transfer between accounts' }))
    const drawer = within(screen.getByRole('dialog', { name: 'New transfer' }))
    await user.type(drawer.getByLabelText('Amount (VND)'), '2,000,000')
    await user.click(drawer.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await goTo('Accounts')

    expect(await balances()).toEqual(['₫3,000,000', '₫3,000,000', '$10.00'])
  })

  it('are written in Vietnamese for a user who reads Vietnamese', async () => {
    fakeApis(toSavings)
    const { user } = renderApp('/transactions', { language: 'vi' })

    await screen.findByRole('list', { name: 'Giao dịch' })
    expect(listed('Giao dịch').map(([title, details]) => [title, details?.split(' · ').slice(0, 2)])).toEqual([
      ['Chuyển đến', ['Chuyển khoản', 'Savings']],
      ['Chuyển đi', ['Chuyển khoản', 'Everyday']],
    ])
    await user.click(screen.getByRole('button', { name: 'Chuyển giữa các tài khoản' }))

    const drawer = within(screen.getByRole('dialog', { name: 'Chuyển khoản mới' }))
    expect(drawer.getByLabelText('Từ tài khoản')).toHaveDisplayValue('Everyday (VND)')
    expect(drawer.getByLabelText('Đến tài khoản')).toHaveDisplayValue('Savings (VND)')
  })
})
