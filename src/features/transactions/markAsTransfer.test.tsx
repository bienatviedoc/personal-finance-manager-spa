import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeAccountsApi } from '@/test/fakeAccountsApi'
import { defaultTestCategories, fakeCategoriesApi } from '@/test/fakeCategoriesApi'
import { fakeInstitutionsApi } from '@/test/fakeInstitutionsApi'
import { fakeTransactionsApi } from '@/test/fakeTransactionsApi'
import { renderApp } from '@/test/renderApp'

const everyday = '01970000-0000-7000-8000-200000000000'
const visa = '01970000-0000-7000-8000-200000000001'
const dollars = '01970000-0000-7000-8000-200000000002'

const threeAccounts: Parameters<typeof fakeAccountsApi>[0] = [
  { name: 'Everyday', openingBalance: '5000000.00' },
  { name: 'Visa' },
  { name: 'US dollars', currency: 'USD' },
]

/** Paying the card, as the two imported statements show it: an expense on Everyday and income on Visa. */
const cardPayment: Parameters<typeof fakeTransactionsApi>[0] = [
  { type: 'expense', accountId: everyday, amount: '1500000.00', date: '2026-11-02', categoryId: 'c-transport', payee: 'VISA PAYMENT' },
  { type: 'income', accountId: visa, amount: '1500000.00', date: '2026-11-02', categoryId: 'c-salary', payee: 'PAYMENT RECEIVED' },
]

function fakeApis(transactions: Parameters<typeof fakeTransactionsApi>[0]) {
  fakeInstitutionsApi()
  const accountsApi = fakeAccountsApi(threeAccounts)
  const categoriesApi = fakeCategoriesApi({ categories: defaultTestCategories })
  const transactionsApi = fakeTransactionsApi(transactions, { accounts: accountsApi.accounts, categories: categoriesApi.categories })
  return Object.assign(transactionsApi, { categories: categoriesApi.categories })
}

/** Each listed transaction: what it is headed by and the line under it; read whether or not the drawer is open over the list. */
function listed() {
  return within(screen.getByRole('list', { name: 'Transactions', hidden: true }))
    .getAllByRole('listitem', { hidden: true })
    .map((item) => [within(item).getByRole('heading', { hidden: true }).textContent, within(item).getByTestId('details').textContent])
}

describe('marking as a transfer', () => {
  it('joins an expense on one account and income on another, which the user picks, into the two legs of one transfer', async () => {
    const transactionsApi = fakeApis(cardPayment)
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('checkbox', { name: 'Select VISA PAYMENT' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select PAYMENT RECEIVED' }))
    await user.click(screen.getByRole('button', { name: 'Mark as transfer' }))

    await waitFor(() =>
      expect(listed().toSorted()).toEqual([
        ['Transfer in', 'Transfer · Visa · Nov 2, 2026'],
        ['Transfer out', 'Transfer · Everyday · Nov 2, 2026'],
      ]),
    )
    const [expense, income] = cardPayment.map((_, index) => transactionsApi.transactions[index]!.id)
    expect(transactionsApi.markRequests).toEqual([{ expenseId: expense, incomeId: income }])
    // Neither is income or spending any more.
    await waitFor(() => expect(screen.getByRole('region', { name: "Total of these transactions" })).not.toHaveTextContent('1,500,000'))
    expect(screen.queryByRole('button', { name: 'Mark as transfer' })).not.toBeInTheDocument()
  })

  it('keeps what was picked under one account filter while the other is picked under another', async () => {
    const transactionsApi = fakeApis(cardPayment)
    const { user, router } = renderApp(`/transactions?accountId=${everyday}`)

    await user.click(await screen.findByRole('checkbox', { name: 'Select VISA PAYMENT' }))
    await router.navigate(`/transactions?accountId=${visa}`)
    await user.click(await screen.findByRole('checkbox', { name: 'Select PAYMENT RECEIVED' }))
    expect(screen.queryByText('Pick one expense and one income.')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mark as transfer' }))

    const [expense, income] = cardPayment.map((_, index) => transactionsApi.transactions[index]!.id)
    await waitFor(() => expect(transactionsApi.markRequests).toEqual([{ expenseId: expense, incomeId: income }]))
  })

  it('is offered for income and expenses only: not for a refund or a leg of a transfer, and once one expense and one income are selected', async () => {
    fakeApis([
      ...cardPayment,
      { type: 'expense', accountId: everyday, amount: '50000.00', date: '2026-11-01', categoryId: 'c-food', payee: 'Shop', isRefund: true },
      { type: 'transferOut', accountId: everyday, amount: '10.00', date: '2026-11-01', transferId: 't-1' },
      { type: 'transferIn', accountId: visa, amount: '10.00', date: '2026-11-01', transferId: 't-1' },
    ])
    const { user } = renderApp('/transactions')

    await screen.findByRole('checkbox', { name: 'Select VISA PAYMENT' })
    expect(screen.queryByRole('button', { name: 'Mark as transfer' })).not.toBeInTheDocument()
    // A refund or a leg can be selected for a bulk action, but not marked as a transfer.
    for (const other of ['Shop', 'Transfer out']) {
      await user.click(screen.getByRole('checkbox', { name: `Select ${other}` }))
      expect(screen.queryByRole('button', { name: 'Mark as transfer' })).not.toBeInTheDocument()
      await user.click(screen.getByRole('checkbox', { name: `Select ${other}` }))
    }

    await user.click(screen.getByRole('checkbox', { name: 'Select VISA PAYMENT' }))
    expect(screen.getByRole('button', { name: 'Mark as transfer' })).toBeDisabled()
    expect(screen.getByText('Pick one expense and one income.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(screen.getByRole('checkbox', { name: 'Select VISA PAYMENT' })).not.toBeChecked()
    expect(screen.queryByRole('button', { name: 'Mark as transfer' })).not.toBeInTheDocument()
  })

  it('is refused before the API is contacted when both are on one account, on different dates, or of different amounts in one currency', async () => {
    const transactionsApi = fakeApis([
      { type: 'expense', accountId: everyday, amount: '100.00', date: '2026-11-02', categoryId: 'c-transport', payee: 'Out' },
      { type: 'income', accountId: everyday, amount: '100.00', date: '2026-11-02', categoryId: 'c-salary', payee: 'Same account' },
      { type: 'income', accountId: visa, amount: '100.00', date: '2026-11-01', categoryId: 'c-salary', payee: 'Day before' },
      { type: 'income', accountId: visa, amount: '90.00', date: '2026-11-02', categoryId: 'c-salary', payee: 'Less' },
      { type: 'income', accountId: dollars, amount: '0.01', currency: 'USD', date: '2026-11-02', categoryId: 'c-salary', payee: 'Dollars' },
    ])
    const { user } = renderApp('/transactions')
    await user.click(await screen.findByRole('checkbox', { name: 'Select Out' }))
    const tryWith = async (income: string, reason: string) => {
      await user.click(screen.getByRole('checkbox', { name: `Select ${income}` }))
      expect(screen.getByText(reason)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Mark as transfer' })).toBeDisabled()
      await user.click(screen.getByRole('checkbox', { name: `Select ${income}` }))
    }

    await tryWith('Same account', 'A transfer is between two different accounts.')
    await tryWith('Day before', 'The two must be on the same date.')
    await tryWith('Less', 'Between accounts in one currency, the two must be of the same amount.')
    // Between currencies each keeps its own amount.
    await user.click(screen.getByRole('checkbox', { name: 'Select Dollars' }))
    expect(screen.getByRole('button', { name: 'Mark as transfer' })).toBeEnabled()
    expect(transactionsApi.markRequests).toEqual([])
  })

  it('says so when the API refuses, and loads the list again', async () => {
    const transactionsApi = fakeApis(cardPayment)
    const { user } = renderApp('/transactions')
    await user.click(await screen.findByRole('checkbox', { name: 'Select VISA PAYMENT' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select PAYMENT RECEIVED' }))
    // Made a refund somewhere else since the list was loaded.
    transactionsApi.transactions[0]!.isRefund = true
    await user.click(screen.getByRole('button', { name: 'Mark as transfer' }))

    expect(await screen.findByText('These two could not be marked as a transfer: one of them changed somewhere else. Check them and try again.')).toBeInTheDocument()
    expect(transactionsApi.transactions.map((transaction) => transaction.type)).toEqual(['expense', 'income'])
  })

  it('says in a toast when marking fails, and trying again marks them', async () => {
    const transactionsApi = fakeApis(cardPayment)
    const { user } = renderApp('/transactions')
    await user.click(await screen.findByRole('checkbox', { name: 'Select VISA PAYMENT' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select PAYMENT RECEIVED' }))
    transactionsApi.failNext()
    await user.click(screen.getByRole('button', { name: 'Mark as transfer' }))

    expect(await screen.findByText('The two were not marked as a transfer.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(transactionsApi.transactions.map((transaction) => transaction.type)).toEqual(['transferOut', 'transferIn']))
  })
})

describe('unmarking a transfer', () => {
  const marked: Parameters<typeof fakeTransactionsApi>[0] = [
    { type: 'transferOut', accountId: everyday, amount: '1500000.00', date: '2026-11-02', transferId: 't-1' },
    { type: 'transferIn', accountId: visa, amount: '1500000.00', date: '2026-11-02', transferId: 't-1' },
  ]

  it('unmarks it into an expense and income, on the categories the user chooses', async () => {
    const transactionsApi = fakeApis(marked)
    const { user } = renderApp('/transactions')
    await user.click(await screen.findByRole('button', { name: 'Edit Transfer out' }))
    const drawer = within(await screen.findByRole('dialog', { name: 'Edit transfer' }))

    await user.click(await drawer.findByRole('button', { name: 'Unmark transfer' }))
    await user.click(drawer.getByRole('button', { name: 'Unmark' }))
    expect(await drawer.findAllByText('Choose a category.')).toHaveLength(2)
    expect(transactionsApi.unmarkRequests).toEqual([])

    await user.selectOptions(drawer.getByLabelText('Category of the expense (Everyday)'), 'Transport')
    await user.selectOptions(drawer.getByLabelText('Category of the income (Visa)'), 'Salary')
    expect(within(drawer.getByLabelText('Category of the expense (Everyday)')).getAllByRole('option').map((option) => option.textContent)).not.toContain('Salary')
    await user.click(drawer.getByRole('button', { name: 'Unmark' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(transactionsApi.unmarkRequests).toEqual([{ id: 't-1', body: { expenseCategoryId: 'c-transport', incomeCategoryId: 'c-salary' } }])
    await waitFor(() =>
      expect(listed().toSorted()).toEqual([
        ['Salary', 'Salary · Visa · Nov 2, 2026'],
        ['Transport', 'Transport · Everyday · Nov 2, 2026'],
      ]),
    )
  })

  it('shows under its field a category the API refuses, and changes nothing', async () => {
    const transactionsApi = fakeApis(marked)
    const { user } = renderApp('/transactions')
    await user.click(await screen.findByRole('button', { name: 'Edit Transfer in' }))
    const drawer = within(await screen.findByRole('dialog', { name: 'Edit transfer' }))
    await user.click(await drawer.findByRole('button', { name: 'Unmark transfer' }))
    await user.selectOptions(drawer.getByLabelText('Category of the expense (Everyday)'), 'Transport')
    await user.selectOptions(drawer.getByLabelText('Category of the income (Visa)'), 'Salary')
    // Archived somewhere else since the drawer was opened.
    transactionsApi.categories.find((category) => category.id === 'c-salary')!.isArchived = true
    await user.click(drawer.getByRole('button', { name: 'Unmark' }))

    expect(await drawer.findByText('Choose one of your categories that is not archived.')).toBeInTheDocument()
    expect(drawer.getByLabelText('Category of the income (Visa)')).toBeInvalid()
    expect(transactionsApi.transactions.map((transaction) => transaction.type)).toEqual(['transferOut', 'transferIn'])
  })
})
