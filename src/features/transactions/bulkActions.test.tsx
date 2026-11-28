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

function fakeApis(transactions: Parameters<typeof fakeTransactionsApi>[0]) {
  fakeInstitutionsApi()
  const accountsApi = fakeAccountsApi([{ name: 'Everyday', openingBalance: '5000000.00' }, { name: 'Savings' }, { name: 'US dollars', currency: 'USD' }])
  const categoriesApi = fakeCategoriesApi({ categories: defaultTestCategories })
  return Object.assign(fakeTransactionsApi(transactions, { accounts: accountsApi.accounts, categories: categoriesApi.categories }), {
    accounts: accountsApi.accounts,
    categories: categoriesApi.categories,
  })
}

const shopping: Parameters<typeof fakeTransactionsApi>[0] = [
  { type: 'expense', accountId: everyday, amount: '100000.00', date: '2026-11-03', categoryId: 'c-groceries', payee: 'Co.op Mart' },
  { type: 'expense', accountId: everyday, amount: '200000.00', date: '2026-11-02', categoryId: 'c-transport', payee: 'Grab' },
  { type: 'income', accountId: everyday, amount: '9000000.00', date: '2026-11-01', categoryId: 'c-salary', payee: 'Payroll' },
]

/** Each listed transaction: what it is headed by and the line under it. */
function listed() {
  return within(screen.getByRole('list', { name: 'Transactions' }))
    .getAllByRole('listitem')
    .filter((item) => within(item).queryByRole('heading') !== null)
    .map((item) => [within(item).getByRole('heading').textContent, within(item).getByTestId('details').textContent])
}

const bar = () => within(screen.getByRole('region', { name: 'Selected transactions' }))

describe('bulk actions', () => {
  it('give the selected transactions one category, and the list shows it', async () => {
    const transactionsApi = fakeApis(shopping)
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('checkbox', { name: 'Select Co.op Mart' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Grab' }))
    expect(bar().getByText('2 selected')).toBeInTheDocument()
    await user.selectOptions(bar().getByLabelText('Category'), bar().getByRole('option', { name: 'Food & drink › Eating out' }))
    await user.click(bar().getByRole('button', { name: 'Set category' }))

    const [coop, grab] = transactionsApi.transactions.map((transaction) => transaction.id)
    await waitFor(() => expect(transactionsApi.bulkRequests).toEqual([{ action: 'setCategory', transactionIds: [coop, grab], categoryId: 'c-eating-out' }]))
    await waitFor(() =>
      expect(listed()).toEqual([
        ['Co.op Mart', 'Eating out · Everyday · Nov 3, 2026'],
        ['Grab', 'Eating out · Everyday · Nov 2, 2026'],
        ['Payroll', 'Salary · Everyday · Nov 1, 2026'],
      ]),
    )
    // Done, the selection is cleared.
    expect(screen.queryByRole('region', { name: 'Selected transactions' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Select Co.op Mart' })).not.toBeChecked()
    // What was done is said where focus lands, as the panel it was done from is gone.
    expect(screen.getByRole('status')).toHaveTextContent('2 transactions changed.')
    expect(screen.getByRole('status')).toHaveFocus()
  })

  it('change nothing when some cannot take the action, and name each one and why', async () => {
    const transactionsApi = fakeApis(shopping)
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('checkbox', { name: 'Select Co.op Mart' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Payroll' }))
    await user.selectOptions(bar().getByLabelText('Category'), 'Transport')
    await user.click(bar().getByRole('button', { name: 'Set category' }))

    const refused = await bar().findByRole('list', { name: 'Not changed' })
    expect(within(refused).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Payroll, Nov 1, 2026, +₫9,000,000: income takes an income category, and an expense an expense one.',
    ])
    expect(bar().getByText('Nothing was changed: these transactions cannot take it.')).toBeInTheDocument()
    expect(transactionsApi.transactions[0]?.categoryId).toBe('c-groceries')
    // The selection stays, for the user to change it and try again.
    expect(screen.getByRole('checkbox', { name: 'Select Co.op Mart' })).toBeChecked()

    // Another selection starts with nothing said about the last one.
    await user.click(screen.getByRole('checkbox', { name: 'Select Payroll' }))
    expect(bar().queryByRole('list', { name: 'Not changed' })).not.toBeInTheDocument()
  })

  it('name each transaction refused by its payee, date and amount, loaded on the screen or not', async () => {
    fakeApis([
      ...Array.from({ length: 60 }, (_, index) => ({
        type: 'expense' as const,
        accountId: everyday,
        amount: '1000.00',
        date: '2026-11-02',
        categoryId: 'c-groceries',
        payee: `Shop ${index}`,
      })),
      { type: 'income', accountId: everyday, amount: '9000000.00', date: '2026-10-01', categoryId: 'c-salary', payee: 'Payroll' },
    ])
    window.innerHeight = 768
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('checkbox', { name: 'Select all 61 transactions' }))
    // The oldest is on a page not loaded yet.
    expect(screen.queryByRole('checkbox', { name: 'Select Payroll' })).not.toBeInTheDocument()
    await user.selectOptions(bar().getByLabelText('Category'), 'Transport')
    await user.click(bar().getByRole('button', { name: 'Set category' }))

    const refused = await bar().findByRole('list', { name: 'Not changed' })
    expect(within(refused).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Payroll, Oct 1, 2026, +₫9,000,000: income takes an income category, and an expense an expense one.',
    ])
  })

  it('say which of the category and the account named can no longer be chosen, field by field', async () => {
    const transactionsApi = fakeApis(shopping)
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('checkbox', { name: 'Select Grab' }))
    await user.selectOptions(bar().getByLabelText('Category'), bar().getByRole('option', { name: 'Food & drink › Eating out' }))
    transactionsApi.categories.find((category) => category.id === 'c-eating-out')!.isArchived = true
    await user.click(bar().getByRole('button', { name: 'Set category' }))
    expect(await bar().findByText('That category can no longer be chosen. Choose another.')).toBeInTheDocument()

    await user.selectOptions(bar().getByLabelText('Account'), 'Savings')
    transactionsApi.accounts.find((account) => account.id === savings)!.isArchived = true
    await user.click(bar().getByRole('button', { name: 'Move' }))
    expect(await bar().findByText('That account can no longer be chosen. Choose another.')).toBeInTheDocument()
    expect(bar().queryByText('That category can no longer be chosen. Choose another.')).not.toBeInTheDocument()
  })

  it('add a tag to and remove one from the selected transactions', async () => {
    const transactionsApi = fakeApis(shopping)
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('checkbox', { name: 'Select Co.op Mart' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Grab' }))
    await user.type(bar().getByLabelText('Tag'), 'Japan-Trip')
    await user.click(bar().getByRole('button', { name: 'Add tag' }))

    await waitFor(() => expect(transactionsApi.transactions.map((transaction) => transaction.tags)).toEqual([['japan-trip'], ['japan-trip'], []]))
    expect(transactionsApi.bulkRequests[0]).toEqual(expect.objectContaining({ action: 'addTag', tag: 'Japan-Trip' }))

    await user.click(await screen.findByRole('checkbox', { name: 'Select Grab' }))
    await user.type(bar().getByLabelText('Tag'), 'japan-trip')
    await user.click(bar().getByRole('button', { name: 'Remove tag' }))
    await waitFor(() => expect(transactionsApi.transactions.map((transaction) => transaction.tags)).toEqual([['japan-trip'], [], []]))
  })

  it('move the selected transactions to another account, whose balance follows', async () => {
    const transactionsApi = fakeApis(shopping)
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('checkbox', { name: 'Select Co.op Mart' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Grab' }))
    await user.selectOptions(bar().getByLabelText('Account'), 'Savings')
    await user.click(bar().getByRole('button', { name: 'Move' }))

    await waitFor(() => expect(listed().map(([, details]) => details)).toEqual([
      'Groceries · Savings · Nov 3, 2026',
      'Transport · Savings · Nov 2, 2026',
      'Salary · Everyday · Nov 1, 2026',
    ]))
    expect(transactionsApi.accounts.find((account) => account.id === savings)?.balance).toBe('-300000.00')
  })

  it('refuse a move to an account in another currency, naming the transactions', async () => {
    fakeApis(shopping)
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('checkbox', { name: 'Select Grab' }))
    await user.selectOptions(bar().getByLabelText('Account'), 'US dollars')
    await user.click(bar().getByRole('button', { name: 'Move' }))

    const refused = await bar().findByRole('list', { name: 'Not changed' })
    expect(within(refused).getByRole('listitem')).toHaveTextContent('Grab, Nov 2, 2026, -₫200,000: a transaction moves only to an account in its own currency.')
    expect(listed()[1]).toEqual(['Grab', 'Transport · Everyday · Nov 2, 2026'])
  })

  it('delete the selected transactions once confirmed, and the total follows', async () => {
    const transactionsApi = fakeApis(shopping)
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('checkbox', { name: 'Select Co.op Mart' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Grab' }))
    await user.click(bar().getByRole('button', { name: 'Delete' }))
    expect(bar().getByText('Delete 2 transactions? You can restore them from Recently deleted for 30 days.')).toBeInTheDocument()
    await user.click(bar().getByRole('button', { name: 'Delete them' }))

    await waitFor(() => expect(listed()).toEqual([['Payroll', 'Salary · Everyday · Nov 1, 2026']]))
    expect(transactionsApi.deleted.map((deleted) => deleted.payee)).toEqual(['Co.op Mart', 'Grab'])
    await waitFor(() => expect(screen.getByRole('region', { name: 'Total of these transactions' })).not.toHaveTextContent('300,000'))
  })

  it('move focus onto the confirmation of a delete, and back to Delete when it is cancelled', async () => {
    fakeApis(shopping)
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('checkbox', { name: 'Select Grab' }))
    await user.click(bar().getByRole('button', { name: 'Delete' }))
    expect(bar().getByRole('button', { name: 'Delete them' })).toHaveFocus()
    await user.click(bar().getByRole('button', { name: 'Cancel' }))

    expect(bar().getByRole('button', { name: 'Delete' })).toHaveFocus()
  })

  it('count both legs of a transfer deleted by deleting one', async () => {
    fakeApis([
      ...shopping,
      { type: 'transferOut', accountId: everyday, amount: '10.00', date: '2026-11-01', transferId: 't-1' },
      { type: 'transferIn', accountId: savings, amount: '10.00', date: '2026-11-01', transferId: 't-1' },
    ])
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('checkbox', { name: 'Select Grab' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Transfer out' }))
    await user.click(bar().getByRole('button', { name: 'Delete' }))
    await user.click(bar().getByRole('button', { name: 'Delete them' }))

    expect(await screen.findByRole('status')).toHaveTextContent('3 transactions changed.')
  })

  it('select every transaction that passes the filters at once, loaded or not, and act on them by the filters', async () => {
    const transactionsApi = fakeApis([
      ...Array.from({ length: 60 }, (_, index) => ({
        type: 'expense' as const,
        accountId: everyday,
        amount: '1000.00',
        date: '2026-11-02',
        categoryId: 'c-groceries',
        payee: `Shop ${index}`,
      })),
      { type: 'expense', accountId: savings, amount: '1000.00', date: '2026-11-02', categoryId: 'c-groceries', payee: 'Elsewhere' },
    ])
    window.innerHeight = 768
    const { user } = renderApp(`/transactions?accountId=${everyday}`)

    await user.click(await screen.findByRole('checkbox', { name: 'Select all 60 transactions' }))
    expect(bar().getByText('60 selected')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Select Shop 59' })).toBeChecked()
    await user.type(bar().getByLabelText('Tag'), 'weekly')
    await user.click(bar().getByRole('button', { name: 'Add tag' }))

    await waitFor(() => expect(transactionsApi.bulkRequests).toEqual([{ action: 'addTag', filter: { accountId: everyday }, tag: 'weekly' }]))
    await waitFor(() => expect(transactionsApi.transactions.filter((transaction) => transaction.tags.includes('weekly'))).toHaveLength(60))
    expect(transactionsApi.transactions.find((transaction) => transaction.payee === 'Elsewhere')?.tags).toEqual([])
  })

  it('do not offer to select all of a view that more transactions pass than one action takes, and say to narrow the filters', async () => {
    fakeApis(Array.from({ length: 1001 }, (_, index) => ({ ...shopping[0]!, payee: `Shop ${index}` })))
    window.innerHeight = 768
    renderApp('/transactions')

    expect(await screen.findByText('1,001 transactions pass these filters, and a bulk action takes at most 1,000. Narrow the filters to select them all.')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Select all/ })).not.toBeInTheDocument()
    // Each can still be selected one by one.
    expect(screen.getAllByRole('checkbox', { name: /^Select Shop/ }).length).toBeGreaterThan(0)
  })

  it('say to narrow the filters when more transactions pass them by the time the action is sent than one action takes', async () => {
    const transactionsApi = fakeApis(Array.from({ length: 1000 }, (_, index) => ({ ...shopping[0]!, payee: `Shop ${index}` })))
    window.innerHeight = 768
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('checkbox', { name: 'Select all 1,000 transactions' }))
    transactionsApi.transactions.push({ ...transactionsApi.transactions[0]!, id: 'one-more' })
    await user.type(bar().getByLabelText('Tag'), 'weekly')
    await user.click(bar().getByRole('button', { name: 'Add tag' }))

    expect(await bar().findByText('More than 1,000 transactions pass these filters now. Narrow the filters, or select fewer, and try again.')).toBeInTheDocument()
    expect(bar().queryByText(/can no longer be chosen/)).not.toBeInTheDocument()
    expect(transactionsApi.transactions.filter((transaction) => transaction.tags.includes('weekly'))).toHaveLength(0)
  })

  it('unselecting rows of all of them keeps every other one that passes the filters, loaded or not, and acts on the filters except those', async () => {
    const transactionsApi = fakeApis(
      Array.from({ length: 60 }, (_, index) => ({
        type: 'expense' as const,
        accountId: everyday,
        amount: '1000.00',
        date: '2026-11-02',
        categoryId: 'c-groceries',
        payee: `Shop ${index}`,
      })),
    )
    window.innerHeight = 768
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('checkbox', { name: 'Select all 60 transactions' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Shop 59' }))
    expect(screen.getByRole('checkbox', { name: 'Select Shop 59' })).not.toBeChecked()
    expect(bar().getByText('59 selected')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Select Shop 58' }))
    expect(bar().getByText('58 selected')).toBeInTheDocument()
    // Selected again, it is one of all of them again.
    await user.click(screen.getByRole('checkbox', { name: 'Select Shop 58' }))
    expect(bar().getByText('59 selected')).toBeInTheDocument()
    await user.type(bar().getByLabelText('Tag'), 'weekly')
    await user.click(bar().getByRole('button', { name: 'Add tag' }))

    const shop59 = transactionsApi.transactions.find((transaction) => transaction.payee === 'Shop 59')!
    await waitFor(() => expect(transactionsApi.bulkRequests).toEqual([{ action: 'addTag', filter: {}, exceptTransactionIds: [shop59.id], tag: 'weekly' }]))
    await waitFor(() => expect(transactionsApi.transactions.filter((transaction) => transaction.tags.includes('weekly'))).toHaveLength(59))
    expect(shop59.tags).toEqual([])
  })

  it('show all of them as partly selected once rows are left out, and select every one again from there', async () => {
    const transactionsApi = fakeApis(shopping)
    const { user } = renderApp('/transactions')

    const selectAll = await screen.findByRole('checkbox', { name: 'Select all 3 transactions' })
    await user.click(selectAll)
    await user.click(screen.getByRole('checkbox', { name: 'Select Grab' }))
    expect(selectAll).toBePartiallyChecked()
    expect(selectAll).not.toBeChecked()

    await user.click(selectAll)
    expect(selectAll).toBeChecked()
    expect(selectAll).not.toBePartiallyChecked()
    expect(screen.getByRole('checkbox', { name: 'Select Grab' })).toBeChecked()
    expect(bar().getByText('3 selected')).toBeInTheDocument()
    await user.click(bar().getByRole('button', { name: 'Delete' }))
    await user.click(bar().getByRole('button', { name: 'Delete them' }))
    await waitFor(() => expect(transactionsApi.bulkRequests).toEqual([{ action: 'delete', filter: {} }]))
  })

  it('unselecting every row of all of them clears the selection', async () => {
    fakeApis(shopping)
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('checkbox', { name: 'Select all 3 transactions' }))
    for (const name of ['Co.op Mart', 'Grab', 'Payroll']) await user.click(screen.getByRole('checkbox', { name: `Select ${name}` }))

    expect(screen.queryByRole('region', { name: 'Selected transactions' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Select all 3 transactions' })).not.toBeChecked()
  })

  it('say so with a way to try again when the request fails', async () => {
    const transactionsApi = fakeApis(shopping)
    const { user } = renderApp('/transactions')
    await user.click(await screen.findByRole('checkbox', { name: 'Select Grab' }))
    transactionsApi.failNext()

    await user.type(bar().getByLabelText('Tag'), 'oops')
    await user.click(bar().getByRole('button', { name: 'Add tag' }))
    await user.click(await screen.findByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(transactionsApi.transactions[1]?.tags).toEqual(['oops']))
  })

  it('is selected with the checkbox of any transaction the API has, a leg of a transfer and a refund too', async () => {
    fakeApis([
      ...shopping,
      { type: 'expense', accountId: everyday, amount: '50000.00', date: '2026-11-01', categoryId: 'c-food', payee: 'Shop', isRefund: true },
      { type: 'transferOut', accountId: everyday, amount: '10.00', date: '2026-11-01', transferId: 't-1' },
      { type: 'transferIn', accountId: dollars, amount: '10.00', date: '2026-11-01', transferId: 't-1' },
    ])
    renderApp('/transactions')

    await screen.findByRole('checkbox', { name: 'Select Grab' })
    expect(screen.getAllByRole('checkbox').map((box) => box.getAttribute('aria-label') ?? box.closest('label')?.textContent).toSorted()).toEqual([
      'Select Co.op Mart',
      'Select Grab',
      'Select Payroll',
      'Select Shop',
      'Select Transfer in',
      'Select Transfer out',
      'Select all 6 transactions',
    ])
  })
})
