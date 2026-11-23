import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeAccountsApi } from '@/test/fakeAccountsApi'
import { defaultTestCategories, fakeCategoriesApi, type FakeCategory } from '@/test/fakeCategoriesApi'
import { fakeInstitutionsApi } from '@/test/fakeInstitutionsApi'
import { fakeTransactionsApi } from '@/test/fakeTransactionsApi'
import { renderApp } from '@/test/renderApp'

const everyday = '01970000-0000-7000-8000-200000000000'
const dollars = '01970000-0000-7000-8000-200000000001'

/** Today in the test user's time zone, which is as late as a transaction can be dated. */
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

const twoAccounts: Parameters<typeof fakeAccountsApi>[0] = [
  { name: 'Everyday', openingBalance: '1000000.00' },
  { name: 'Savings in dollars', currency: 'USD', openingBalance: '100.00' },
]

function fakeApis(
  transactions: Parameters<typeof fakeTransactionsApi>[0] = [],
  accounts: Parameters<typeof fakeAccountsApi>[0] = twoAccounts,
  categories: FakeCategory[] = defaultTestCategories,
) {
  fakeInstitutionsApi()
  const accountsApi = fakeAccountsApi(accounts)
  const categoriesApi = fakeCategoriesApi({ categories })
  const transactionsApi = fakeTransactionsApi(transactions, { accounts: accountsApi.accounts, categories: categoriesApi.categories, today })
  return { accountsApi, categoriesApi, transactionsApi }
}

/**
 * Each listed transaction: what it is headed by, the line under it, and its amount. Read whether or not the
 * drawer is open over the list, which hides the list from assistive technology meanwhile.
 */
function listed() {
  return within(screen.getByRole('list', { name: 'Transactions', hidden: true }))
    .getAllByRole('listitem', { hidden: true })
    .map((item) => [
      within(item).getByRole('heading', { hidden: true }).textContent,
      within(item).getByTestId('details').textContent,
      within(item).getByTestId('amount').textContent,
    ])
}

describe('transactions', () => {
  it('are listed newest first, each with its payee, category, account, date and an amount whose sign is its type', async () => {
    fakeApis([
      { type: 'expense', accountId: everyday, amount: '125000.00', date: '2026-11-02', categoryId: 'c-groceries', payee: 'Co.opmart' },
      { type: 'income', accountId: dollars, amount: '2500.50', date: '2026-11-05', categoryId: 'c-salary', payee: 'Acme' },
      { type: 'expense', accountId: everyday, amount: '45000.00', date: '2026-10-28', categoryId: 'c-transport' },
    ])
    renderApp('/transactions')

    await screen.findByRole('list', { name: 'Transactions' })
    expect(listed()).toEqual([
      ['Acme', 'Salary · Savings in dollars · Nov 5, 2026', '$2,500.50'],
      ['Co.opmart', 'Groceries · Everyday · Nov 2, 2026', '-₫125,000'],
      ['Transport', 'Transport · Everyday · Oct 28, 2026', '-₫45,000'],
    ])
  })

  it('say so when there are none yet, and ask for an account first when there is none to record them on', async () => {
    fakeApis()
    const first = renderApp('/transactions')
    expect(await screen.findByText('No transactions yet. Add your first income or expense.')).toBeInTheDocument()
    first.unmount()

    fakeApis([], [{ name: 'Closed', isArchived: true }])
    renderApp('/transactions')

    expect(await screen.findByText('A transaction is recorded on an account, and you have none yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add an account' })).toHaveAttribute('href', '/accounts')
    expect(screen.queryByRole('button', { name: 'Add transaction' })).not.toBeInTheDocument()
  })

  it('are loaded a page at a time, the next as the end of the one before comes on screen', async () => {
    const { transactionsApi } = fakeApis(Array.from({ length: 51 }, (_, index) => ({ payee: `Shop ${String(index + 1).padStart(2, '0')}`, amount: '1.00' })))
    renderApp('/transactions')

    // The test's screen has room for every row, so the end of the first page is on it at once.
    await waitFor(() => expect(listed()).toHaveLength(51), { timeout: 5000 })
    expect(transactionsApi.listQueries).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('are recorded in a side drawer with a type toggle at the top: an expense with account, amount, date, category, payee and note', async () => {
    const { transactionsApi } = fakeApis()
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('button', { name: 'Add transaction' }))
    const drawer = within(screen.getByRole('dialog', { name: 'New transaction' }))
    expect(drawer.getByRole('radio', { name: 'Expense' })).toBeChecked()
    expect(drawer.getByRole('radio', { name: 'Income' })).not.toBeChecked()
    expect(drawer.getByLabelText('Account')).toHaveDisplayValue('Everyday (VND)')
    expect(drawer.getByLabelText('Date')).toHaveValue(today)
    await user.type(drawer.getByLabelText('Amount (VND)'), '125,000')
    await user.clear(drawer.getByLabelText('Date'))
    await user.type(drawer.getByLabelText('Date'), '2026-11-02')
    await user.selectOptions(drawer.getByLabelText('Category'), drawer.getByRole('option', { name: 'Food & drink › Groceries' }))
    await user.type(drawer.getByLabelText('Payee'), 'Co.opmart')
    await user.type(drawer.getByLabelText('Note'), 'weekly shop')
    await user.click(drawer.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(transactionsApi.transactions).toHaveLength(1))
    expect(transactionsApi.requests).toEqual([
      {
        method: 'POST',
        body: { type: 'expense', accountId: everyday, amount: '125000', date: '2026-11-02', categoryId: 'c-groceries', payee: 'Co.opmart', note: 'weekly shop' },
      },
    ])
    expect(listed()).toEqual([['Co.opmart', 'Groceries · Everyday · Nov 2, 2026', '-₫125,000']])
    expect(screen.getByText('weekly shop')).toBeInTheDocument()
  })

  it('offer income only income categories and an expense only expense categories, and let go of a category of the other kind', async () => {
    fakeApis()
    const { user } = renderApp('/transactions')
    await user.click(await screen.findByRole('button', { name: 'Add transaction' }))
    const drawer = within(screen.getByRole('dialog', { name: 'New transaction' }))
    const offered = () => within(drawer.getByLabelText('Category')).getAllByRole('option').map((option) => option.textContent)

    expect(offered()).toEqual(['Choose a category', 'Food & drink', 'Food & drink › Groceries', 'Food & drink › Eating out', 'Transport'])
    await user.selectOptions(drawer.getByLabelText('Category'), 'Transport')
    await user.click(drawer.getByRole('radio', { name: 'Income' }))

    expect(offered()).toEqual(['Choose a category', 'Salary', 'Investments', 'Investments › Interest'])
    expect(drawer.getByLabelText('Category')).toHaveDisplayValue('Choose a category')
  })

  it('can only be recorded on accounts and categories that are not archived', async () => {
    fakeApis(
      [],
      [{ name: 'Closed', isArchived: true }, { name: 'Everyday' }],
      [...defaultTestCategories, { id: 'c-old', parentId: null, name: 'Old habit', kind: 'expense', icon: 'car', color: '#3b82f6', isArchived: true }],
    )
    const { user } = renderApp('/transactions')
    await user.click(await screen.findByRole('button', { name: 'Add transaction' }))
    const drawer = within(screen.getByRole('dialog', { name: 'New transaction' }))

    expect(within(drawer.getByLabelText('Account')).getAllByRole('option').map((option) => option.textContent)).toEqual(['Everyday (VND)'])
    expect(within(drawer.getByLabelText('Category')).queryByRole('option', { name: 'Old habit' })).not.toBeInTheDocument()
  })

  it('take their amount in the currency of the chosen account', async () => {
    const { transactionsApi } = fakeApis()
    const { user } = renderApp('/transactions')
    await user.click(await screen.findByRole('button', { name: 'Add transaction' }))
    const drawer = within(screen.getByRole('dialog', { name: 'New transaction' }))

    await user.selectOptions(drawer.getByLabelText('Account'), 'Savings in dollars (USD)')
    await user.type(drawer.getByLabelText('Amount (USD)'), '12.5')
    await user.selectOptions(drawer.getByLabelText('Category'), 'Transport')
    // Dollars and cents do not fit an account in đồng, which has no decimals.
    await user.selectOptions(drawer.getByLabelText('Account'), 'Everyday (VND)')
    await user.click(drawer.getByRole('button', { name: 'Save' }))
    expect(await drawer.findByText('Enter an amount, such as 1,250,000.')).toBeInTheDocument()
    expect(transactionsApi.requests).toEqual([])

    await user.selectOptions(drawer.getByLabelText('Account'), 'Savings in dollars (USD)')
    await user.click(drawer.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(transactionsApi.transactions).toEqual([expect.objectContaining({ accountId: dollars, amount: '12.50', currency: 'USD' })]))
    expect(listed()).toEqual([['Transport', 'Transport · Savings in dollars · ' + shortDate(today), '-$12.50']])
  })

  it('are held to the API’s rules before it is contacted: an amount above zero, a date not in the future, a category', async () => {
    const { transactionsApi } = fakeApis()
    const { user } = renderApp('/transactions')
    await user.click(await screen.findByRole('button', { name: 'Add transaction' }))
    const drawer = within(screen.getByRole('dialog', { name: 'New transaction' }))
    const save = () => user.click(drawer.getByRole('button', { name: 'Save' }))

    await save()
    expect(await drawer.findByText('Enter an amount.')).toBeInTheDocument()
    expect(drawer.getByText('Choose a category.')).toBeInTheDocument()
    expect(drawer.getByLabelText('Amount (VND)')).toHaveAccessibleDescription('Enter an amount.')

    await user.type(drawer.getByLabelText('Amount (VND)'), '0')
    await save()
    expect(await drawer.findByText('Enter an amount greater than zero.')).toBeInTheDocument()

    await user.clear(drawer.getByLabelText('Amount (VND)'))
    await user.type(drawer.getByLabelText('Amount (VND)'), '-5')
    await save()
    expect(await drawer.findByText('Enter an amount, such as 1,250,000.')).toBeInTheDocument()

    await user.clear(drawer.getByLabelText('Amount (VND)'))
    await user.type(drawer.getByLabelText('Amount (VND)'), '5')
    await user.selectOptions(drawer.getByLabelText('Category'), 'Transport')
    await user.clear(drawer.getByLabelText('Date'))
    await user.type(drawer.getByLabelText('Date'), '2999-01-01')
    await user.type(drawer.getByLabelText('Payee'), 'p'.repeat(201))
    await save()
    expect(await drawer.findByText('The date cannot be in the future.')).toBeInTheDocument()
    expect(drawer.getByText('Use at most 200 characters.')).toBeInTheDocument()
    expect(drawer.queryByText(/Enter an amount/)).not.toBeInTheDocument()

    expect(transactionsApi.requests).toEqual([])
  })

  it('show under its field what the API refuses, and the list goes back to what it was', async () => {
    const { categoriesApi, transactionsApi } = fakeApis([{ payee: 'Earlier', amount: '10.00' }])
    const { user } = renderApp('/transactions')
    await user.click(await screen.findByRole('button', { name: 'Add transaction' }))
    const drawer = within(screen.getByRole('dialog', { name: 'New transaction' }))
    await user.type(drawer.getByLabelText('Amount (VND)'), '5')
    await user.selectOptions(drawer.getByLabelText('Category'), 'Transport')
    // Archived on another device while this drawer is open.
    categoriesApi.categories.find((category) => category.id === 'c-transport')!.isArchived = true

    await user.click(drawer.getByRole('button', { name: 'Save' }))

    expect(await drawer.findByText('Choose a category.')).toBeInTheDocument()
    expect(transactionsApi.transactions).toHaveLength(1)
    expect(listed().map(([title]) => title)).toEqual(['Earlier'])
  })

  it('appear in the list as soon as they are saved, before the API has answered', async () => {
    const { transactionsApi } = fakeApis([{ payee: 'Earlier', amount: '10.00', date: '2026-11-01' }])
    const { user } = renderApp('/transactions')
    await user.click(await screen.findByRole('button', { name: 'Add transaction' }))
    const drawer = within(screen.getByRole('dialog', { name: 'New transaction' }))
    await user.click(drawer.getByRole('radio', { name: 'Income' }))
    await user.type(drawer.getByLabelText('Amount (VND)'), '15,000,000')
    await user.selectOptions(drawer.getByLabelText('Category'), 'Salary')
    await user.type(drawer.getByLabelText('Payee'), 'Acme')
    const answer = transactionsApi.hold()

    await user.click(drawer.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(listed().map(([title, , amount]) => [title, amount])).toEqual([['Acme', '₫15,000,000'], ['Earlier', '-₫10']]))
    expect(transactionsApi.transactions).toHaveLength(1)
    // Not yet a transaction the API knows: there is nothing to edit or delete.
    expect(screen.queryByRole('button', { name: 'Edit Acme', hidden: true })).not.toBeInTheDocument()

    answer()
    expect(await screen.findByRole('button', { name: 'Edit Acme', hidden: true })).toBeInTheDocument()
    expect(listed().map(([title]) => title)).toEqual(['Acme', 'Earlier'])
    expect(transactionsApi.transactions).toHaveLength(2)
  })

  it('leave the list again when saving fails, with a toast to try again, which cannot record the transaction twice', async () => {
    const { transactionsApi } = fakeApis()
    const { user } = renderApp('/transactions')
    await user.click(await screen.findByRole('button', { name: 'Add transaction' }))
    const drawer = within(screen.getByRole('dialog', { name: 'New transaction' }))
    await user.type(drawer.getByLabelText('Amount (VND)'), '5')
    await user.selectOptions(drawer.getByLabelText('Category'), 'Transport')
    transactionsApi.failNext()

    await user.click(drawer.getByRole('button', { name: 'Save' }))
    // A toast says so and offers to try again (spec section 12).
    expect(await drawer.findByText('The transaction was not saved.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Transactions', hidden: true })).not.toBeInTheDocument()
    expect(drawer.getByLabelText('Amount (VND)')).toHaveValue('5')

    await user.click(drawer.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(transactionsApi.transactions).toHaveLength(1))
    expect(drawer.queryByText('The transaction was not saved.')).not.toBeInTheDocument()
    await user.type(drawer.getByLabelText('Amount (VND)'), '7')
    await user.selectOptions(drawer.getByLabelText('Category'), 'Transport')
    await user.click(drawer.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(transactionsApi.transactions).toHaveLength(2))

    // The retry repeats the key of the attempt that failed; the next transaction has a key of its own.
    const [failed, retried, next] = transactionsApi.idempotencyKeys
    expect(failed).toMatch(/^[0-9a-f-]{36}$/)
    expect(retried).toBe(failed)
    expect(next).not.toBe(failed)
  })

  it('are a new request when saved again after a failure with something changed: the corrected one is recorded', async () => {
    const { transactionsApi } = fakeApis()
    const { user } = renderApp('/transactions')
    await user.click(await screen.findByRole('button', { name: 'Add transaction' }))
    const drawer = within(screen.getByRole('dialog', { name: 'New transaction' }))
    await user.type(drawer.getByLabelText('Amount (VND)'), '5')
    await user.selectOptions(drawer.getByLabelText('Category'), 'Transport')
    transactionsApi.failNext()
    await user.click(drawer.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(transactionsApi.idempotencyKeys).toHaveLength(1))
    await waitFor(() => expect(drawer.getByRole('button', { name: 'Save' })).toBeEnabled())

    await user.type(drawer.getByLabelText('Amount (VND)'), '0')
    await user.click(drawer.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(transactionsApi.transactions.map((transaction) => transaction.amount)).toEqual(['50.00']))
    const [failed, corrected] = transactionsApi.idempotencyKeys
    expect(corrected).toMatch(/^[0-9a-f-]{36}$/)
    expect(corrected).not.toBe(failed)
  })

  it('keep the drawer open for the next transaction, with the type, account and date of the last', async () => {
    const { transactionsApi } = fakeApis()
    const { user } = renderApp('/transactions')
    await user.click(await screen.findByRole('button', { name: 'Add transaction' }))
    const drawer = within(screen.getByRole('dialog', { name: 'New transaction' }))
    await user.selectOptions(drawer.getByLabelText('Account'), 'Savings in dollars (USD)')
    await user.type(drawer.getByLabelText('Amount (USD)'), '12.5')
    await user.clear(drawer.getByLabelText('Date'))
    await user.type(drawer.getByLabelText('Date'), '2026-11-02')
    await user.selectOptions(drawer.getByLabelText('Category'), 'Transport')
    await user.type(drawer.getByLabelText('Payee'), 'Grab{Enter}')

    expect(await drawer.findByText('Saved. Add another, or close when you are done.')).toBeInTheDocument()
    expect(drawer.getByLabelText('Amount (USD)')).toHaveValue('')
    expect(drawer.getByLabelText('Amount (USD)')).toHaveFocus()
    expect(drawer.getByLabelText('Account')).toHaveDisplayValue('Savings in dollars (USD)')
    expect(drawer.getByLabelText('Date')).toHaveValue('2026-11-02')
    expect(drawer.getByLabelText('Payee')).toHaveValue('')
    expect(transactionsApi.transactions).toHaveLength(1)

    await user.click(drawer.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('open the drawer when N is pressed, but not while typing somewhere', async () => {
    fakeApis()
    const { user } = renderApp('/transactions')
    await screen.findByRole('button', { name: 'Add transaction' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add transaction' })).toBeEnabled())

    await user.keyboard('n')

    const drawer = within(await screen.findByRole('dialog', { name: 'New transaction' }))
    await user.type(drawer.getByLabelText('Payee'), 'Nan n Curry')
    expect(drawer.getByLabelText('Payee')).toHaveValue('Nan n Curry')
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })

  it('are edited in the drawer, naming the row version the edit was made from, and the list shows the change at once', async () => {
    const { transactionsApi } = fakeApis([
      { accountId: everyday, amount: '125000.00', date: '2026-11-02', categoryId: 'c-groceries', payee: 'Co.opmart', note: 'weekly shop', rowVersion: '7' },
    ])
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('button', { name: 'Edit Co.opmart' }))
    const drawer = within(screen.getByRole('dialog', { name: 'Edit transaction' }))
    expect(drawer.getByRole('radio', { name: 'Expense' })).toBeChecked()
    expect(drawer.getByLabelText('Account')).toHaveDisplayValue('Everyday (VND)')
    expect(drawer.getByLabelText('Amount (VND)')).toHaveValue('125,000')
    expect(drawer.getByLabelText('Date')).toHaveValue('2026-11-02')
    expect(drawer.getByLabelText('Category')).toHaveDisplayValue('Food & drink › Groceries')
    expect(drawer.getByLabelText('Payee')).toHaveValue('Co.opmart')
    expect(drawer.getByLabelText('Note')).toHaveValue('weekly shop')
    await user.clear(drawer.getByLabelText('Amount (VND)'))
    await user.type(drawer.getByLabelText('Amount (VND)'), '150,000')
    const answer = transactionsApi.hold()
    await user.click(drawer.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(listed()).toEqual([['Co.opmart', 'Groceries · Everyday · Nov 2, 2026', '-₫150,000']]))
    expect(transactionsApi.transactions[0]?.amount).toBe('125000.00')

    answer()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(transactionsApi.transactions[0]).toEqual(expect.objectContaining({ amount: '150000.00', rowVersion: '8' }))
    expect(transactionsApi.ifMatches).toEqual(['"7"'])
    expect(listed()).toEqual([['Co.opmart', 'Groceries · Everyday · Nov 2, 2026', '-₫150,000']])
  })

  it('keep an account and a category that were archived since, when edited', async () => {
    fakeApis(
      [{ accountId: everyday, categoryId: 'c-old', payee: 'Gym', amount: '300000.00' }],
      [{ name: 'Closed', isArchived: true }, { name: 'Open' }],
      [...defaultTestCategories, { id: 'c-old', parentId: null, name: 'Old habit', kind: 'expense', icon: 'car', color: '#3b82f6', isArchived: true }],
    )
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('button', { name: 'Edit Gym' }))
    const drawer = within(screen.getByRole('dialog', { name: 'Edit transaction' }))

    expect(listed()).toEqual([['Gym', 'Old habit · Closed · Nov 2, 2026', '-₫300,000']])
    expect(drawer.getByLabelText('Account')).toHaveDisplayValue('Closed (VND)')
    expect(drawer.getByLabelText('Category')).toHaveDisplayValue('Old habit')
  })

  it('are not saved over a change made somewhere else: the latest version is shown instead', async () => {
    const { transactionsApi } = fakeApis([{ payee: 'Co.opmart', amount: '125000.00' }])
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('button', { name: 'Edit Co.opmart' }))
    const drawer = within(screen.getByRole('dialog', { name: 'Edit transaction' }))
    // Another device changes the amount while this drawer is open.
    Object.assign(transactionsApi.transactions[0]!, { amount: '99000.00', rowVersion: '2' })
    await user.type(drawer.getByLabelText('Note'), 'mine')
    await user.click(drawer.getByRole('button', { name: 'Save' }))

    expect(
      await drawer.findByText('This transaction was changed somewhere else since you opened it. The latest version is shown; check it and save again.'),
    ).toBeInTheDocument()
    await waitFor(() => expect(drawer.getByLabelText('Amount (VND)')).toHaveValue('99,000'))
    expect(transactionsApi.transactions[0]).toEqual(expect.objectContaining({ amount: '99000.00', note: null }))

    await user.click(drawer.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(transactionsApi.ifMatches).toEqual(['"1"', '"2"']))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('keep the edit open when it moves the transaction past the part of the list loaded so far, so a failure can be tried again', async () => {
    // More than one page, on a screen with no room for all of the first: the list has loaded only the newest.
    window.innerHeight = 768
    const older = Array.from({ length: 50 }, () => ({ date: '2026-11-02' }))
    const { transactionsApi } = fakeApis([{ payee: 'Co.opmart', date: '2026-11-05' }, ...older])
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('button', { name: 'Edit Co.opmart' }))
    const drawer = within(screen.getByRole('dialog', { name: 'Edit transaction' }))
    await user.clear(drawer.getByLabelText('Date'))
    await user.type(drawer.getByLabelText('Date'), '2026-01-01')
    transactionsApi.failNext()
    await user.click(drawer.getByRole('button', { name: 'Save' }))

    expect(await drawer.findByText('The transaction was not saved.')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Edit transaction' })).toBeInTheDocument()
    expect(drawer.getByLabelText('Date')).toHaveValue('2026-01-01')
    expect(transactionsApi.transactions[0]!.date).toBe('2026-11-05')

    await user.click(drawer.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(transactionsApi.transactions[0]!.date).toBe('2026-01-01')
  })

  it('say in a toast when an edit or a delete fails, and do it when the user tries again', async () => {
    const { transactionsApi } = fakeApis([{ payee: 'Co.opmart', amount: '125000.00' }])
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('button', { name: 'Edit Co.opmart' }))
    const drawer = within(screen.getByRole('dialog', { name: 'Edit transaction' }))
    await user.type(drawer.getByLabelText('Note'), 'weekly shop')
    transactionsApi.failNext()
    await user.click(drawer.getByRole('button', { name: 'Save' }))
    expect(await drawer.findByText('The transaction was not saved.')).toBeInTheDocument()
    expect(transactionsApi.transactions[0]!.note).toBeNull()
    await user.click(drawer.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(transactionsApi.transactions[0]!.note).toBe('weekly shop')

    await user.click(await screen.findByRole('button', { name: 'Delete Co.opmart' }))
    transactionsApi.failNext()
    await user.click(within(screen.getByRole('group', { name: 'Delete Co.opmart' })).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('The transaction was not deleted.')).toBeInTheDocument()
    expect(transactionsApi.transactions).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(transactionsApi.transactions).toHaveLength(0))
    await waitFor(() => expect(screen.queryByText('The transaction was not deleted.')).not.toBeInTheDocument())
  })

  it('leave the list once deleted, after the user confirms', async () => {
    const { transactionsApi } = fakeApis([
      { payee: 'Co.opmart', amount: '125000.00' },
      { payee: 'Grab', amount: '45000.00' },
    ])
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('button', { name: 'Delete Grab' }))
    const confirm = within(screen.getByRole('group', { name: 'Delete Grab' }))
    expect(confirm.getByText('Delete Grab? It leaves this list and its account\'s balance.')).toBeInTheDocument()
    expect(transactionsApi.transactions).toHaveLength(2)
    await user.click(confirm.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(listed().map(([title]) => title)).toEqual(['Co.opmart']))
    expect(transactionsApi.transactions.map((transaction) => transaction.payee)).toEqual(['Co.opmart'])
  })

  it('move the balance of their account, which the accounts screen shows without being reloaded', async () => {
    fakeApis([{ accountId: everyday, payee: 'Co.opmart', amount: '100000.00' }], [{ name: 'Everyday', openingBalance: '1000000.00', balance: '900000.00' }])
    const { user } = renderApp('/accounts')
    const balance = async () => within(await screen.findByRole('list', { name: 'Accounts of No institution' })).getByTestId('balance').textContent
    const goTo = (name: string) => user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name }))
    expect(await balance()).toBe('₫900,000')

    await goTo('Transactions')
    await user.click(await screen.findByRole('button', { name: 'Add transaction' }))
    const drawer = within(screen.getByRole('dialog', { name: 'New transaction' }))
    await user.type(drawer.getByLabelText('Amount (VND)'), '250,000')
    await user.selectOptions(drawer.getByLabelText('Category'), 'Transport')
    await user.click(drawer.getByRole('button', { name: 'Save' }))
    await drawer.findByText('Saved. Add another, or close when you are done.')
    await user.click(drawer.getByRole('button', { name: 'Done' }))
    await goTo('Accounts')
    expect(await balance()).toBe('₫650,000')

    await goTo('Transactions')
    await user.click(await screen.findByRole('button', { name: 'Edit Co.opmart' }))
    const editing = within(screen.getByRole('dialog', { name: 'Edit transaction' }))
    await user.clear(editing.getByLabelText('Amount (VND)'))
    await user.type(editing.getByLabelText('Amount (VND)'), '50,000')
    await user.click(editing.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await goTo('Accounts')
    expect(await balance()).toBe('₫700,000')

    await goTo('Transactions')
    await user.click(await screen.findByRole('button', { name: 'Delete Co.opmart' }))
    await user.click(within(screen.getByRole('group', { name: 'Delete Co.opmart' })).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(listed()).toHaveLength(1))
    await goTo('Accounts')
    expect(await balance()).toBe('₫750,000')
  })

  it('are written in Vietnamese for a user who reads Vietnamese', async () => {
    fakeApis([{ accountId: everyday, amount: '125000.00', date: '2026-11-02', categoryId: 'c-groceries', payee: 'Co.opmart' }])
    const { user } = renderApp('/transactions', { language: 'vi' })

    await user.click(await screen.findByRole('button', { name: 'Thêm giao dịch' }))

    const drawer = within(screen.getByRole('dialog', { name: 'Giao dịch mới' }))
    expect(drawer.getByRole('radio', { name: 'Khoản chi' })).toBeChecked()
    expect(drawer.getByLabelText('Số tiền (VND)')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Giao dịch', hidden: true })).getByTestId('amount').textContent).toBe('-125.000 ₫')
  })
})

/** A calendar date as the list writes it in English. */
function shortDate(date: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
}

