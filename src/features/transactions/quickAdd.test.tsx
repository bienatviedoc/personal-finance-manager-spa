import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { choose, offeredBy } from '@/test/combobox'
import { fakeAccountsApi } from '@/test/fakeAccountsApi'
import type { FakeRule } from '@/test/fakeCategorisationRulesApi'
import { defaultTestCategories, fakeCategoriesApi, type FakeCategory } from '@/test/fakeCategoriesApi'
import { fakeInstitutionsApi } from '@/test/fakeInstitutionsApi'
import { fakeTransactionsApi } from '@/test/fakeTransactionsApi'
import { renderApp } from '@/test/renderApp'

const everyday = '01970000-0000-7000-8000-200000000000'
const dollars = '01970000-0000-7000-8000-200000000001'

/** Today in the test user's time zone, which is as late as a transaction can be dated. */
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

function fakeApis(
  transactions: Parameters<typeof fakeTransactionsApi>[0] = [],
  accounts: Parameters<typeof fakeAccountsApi>[0] = [{ name: 'Everyday' }, { name: 'Savings in dollars', currency: 'USD' }],
  categories: FakeCategory[] = defaultTestCategories,
  rules: FakeRule[] = [],
) {
  fakeInstitutionsApi()
  const accountsApi = fakeAccountsApi(accounts)
  const categoriesApi = fakeCategoriesApi({ categories })
  return fakeTransactionsApi(transactions, { accounts: accountsApi.accounts, categories: categoriesApi.categories, today, rules })
}

/** Presses N on a screen and answers the drawer it opens. */
async function quickAdd(path = '/') {
  const app = renderApp(path)
  await screen.findByRole('navigation', { name: 'Main' })
  await app.user.keyboard('n')
  const dialog = await screen.findByRole('dialog', { name: 'New transaction' })
  await within(dialog).findByLabelText('Account')
  return { ...app, drawer: within(dialog) }
}

describe('quick add', () => {
  it('opens the drawer to record a transaction when N is pressed on any screen, and Enter saves and keeps it open, cleared for the next', async () => {
    const transactionsApi = fakeApis()
    const { user, drawer } = await quickAdd('/reports')

    await user.type(drawer.getByLabelText('Amount (VND)'), '45000')
    await user.type(drawer.getByLabelText('Payee'), 'Grab')
    await user.type(drawer.getByLabelText('Category'), 'transp{Enter}')
    expect(transactionsApi.requests).toEqual([])
    await user.keyboard('{Enter}')

    expect(await drawer.findByText('Saved. Add another, or close when you are done.')).toBeInTheDocument()
    expect(transactionsApi.requests).toEqual([
      { method: 'POST', body: { type: 'expense', accountId: everyday, amount: '45000', date: today, categoryId: 'c-transport', payee: 'Grab', note: null, isRefund: false } },
    ])
    expect(drawer.getByLabelText('Amount (VND)')).toHaveValue('')
    await waitFor(() => expect(drawer.getByLabelText('Amount (VND)')).toHaveFocus())
    expect(drawer.getByLabelText('Payee')).toHaveValue('')
    expect(drawer.getByLabelText('Category')).toHaveValue('')

    await user.type(drawer.getByLabelText('Amount (VND)'), '12000')
    await user.type(drawer.getByLabelText('Category'), 'gro{Enter}{Enter}')
    await waitFor(() => expect(transactionsApi.transactions.map((transaction) => transaction.categoryId)).toEqual(['c-transport', 'c-groceries']))
  })

  it('does not open over another drawer, or while the user is typing', async () => {
    fakeApis([{ payee: 'Co.opmart' }])
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('button', { name: 'Edit Co.opmart' }))
    const editing = within(screen.getByRole('dialog', { name: 'Edit transaction' }))
    await user.type(editing.getByLabelText('Note'), 'n')
    editing.getByRole('button', { name: 'Save' }).focus()
    await user.keyboard('n')

    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.queryByRole('dialog', { name: 'New transaction' })).not.toBeInTheDocument()
  })

  it('asks for an account first when there is none to record on', async () => {
    fakeApis([], [{ name: 'Closed', isArchived: true }])
    const app = renderApp('/')
    await screen.findByRole('navigation', { name: 'Main' })
    await app.user.keyboard('n')

    const drawer = within(await screen.findByRole('dialog', { name: 'New transaction' }))
    expect(await drawer.findByText('A transaction is recorded on an account, and you have none yet.')).toBeInTheDocument()
    await app.user.click(drawer.getByRole('link', { name: 'Add an account' }))

    expect(app.router.state.location.pathname).toBe('/accounts')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('starts on the account used last time', async () => {
    fakeApis([
      { accountId: dollars, categoryId: 'c-transport', date: '2026-11-01' },
      { accountId: everyday, categoryId: 'c-transport', date: '2026-11-05' },
      // Recorded last, whatever its date.
      { accountId: dollars, categoryId: 'c-transport', date: '2026-10-20' },
    ])
    const { drawer } = await quickAdd()

    expect(drawer.getByLabelText('Account')).toHaveDisplayValue('Savings in dollars (USD)')
    expect(drawer.getByLabelText('Amount (USD)')).toBeInTheDocument()
  })

  it('starts on the first account when none was used yet, or the one used last is archived since', async () => {
    fakeApis([{ accountId: dollars }], [{ name: 'Everyday' }, { name: 'Savings in dollars', currency: 'USD', isArchived: true }])
    const { drawer } = await quickAdd()

    expect(drawer.getByLabelText('Account')).toHaveDisplayValue('Everyday (VND)')
  })

  it('suggests the category most often used for a payee the user has used before', async () => {
    const transactionsApi = fakeApis([
      { payee: 'Co.opmart', categoryId: 'c-groceries' },
      { payee: 'Co.opmart', categoryId: 'c-groceries' },
      { payee: 'Co.opmart', categoryId: 'c-eating-out' },
      { payee: 'Acme', type: 'income', categoryId: 'c-salary' },
    ])
    const { user, drawer } = await quickAdd()

    await user.type(drawer.getByLabelText('Amount (VND)'), '125000')
    await user.type(drawer.getByLabelText('Payee'), 'co.opmart')

    await waitFor(() => expect(drawer.getByLabelText('Category')).toHaveValue('Food & drink › Groceries'))
    expect(drawer.getByLabelText('Category')).toHaveAccessibleDescription('Suggested from your earlier transactions with this payee.')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(transactionsApi.transactions).toHaveLength(5))
    expect(transactionsApi.transactions.at(-1)).toMatchObject({ payee: 'co.opmart', categoryId: 'c-groceries' })

    // Another payee replaces what was only suggested; a payee never used suggests nothing.
    await user.click(drawer.getByRole('radio', { name: 'Income' }))
    await user.type(drawer.getByLabelText('Payee'), 'Acme')
    await waitFor(() => expect(drawer.getByLabelText('Category')).toHaveValue('Salary'))
    await user.type(drawer.getByLabelText('Payee'), ' Corporation')
    await waitFor(() => expect(drawer.getByLabelText('Category')).toHaveValue(''))
  })

  it('takes the category of a categorisation rule the payee matches when the payee has no history, and says so', async () => {
    fakeApis([{ payee: 'Grab', categoryId: 'c-groceries' }], undefined, defaultTestCategories, [
      { id: 'r-grab', matchText: 'grab', matchType: 'contains', categoryId: 'c-transport', priority: 0, rowVersion: '1' },
    ])
    const { user, drawer } = await quickAdd()

    await user.type(drawer.getByLabelText('Payee'), 'Grab bike')

    await waitFor(() => expect(drawer.getByLabelText('Category')).toHaveValue('Transport'))
    expect(drawer.getByLabelText('Category')).toHaveAccessibleDescription('Suggested by your categorisation rule for this payee.')

    // A payee with history keeps the category it usually has.
    await user.clear(drawer.getByLabelText('Payee'))
    await user.type(drawer.getByLabelText('Payee'), 'Grab')
    await waitFor(() => expect(drawer.getByLabelText('Category')).toHaveValue('Food & drink › Groceries'))
    expect(drawer.getByLabelText('Category')).toHaveAccessibleDescription('Suggested from your earlier transactions with this payee.')
  })

  it('keeps the category the user chose, whatever the payee suggests', async () => {
    fakeApis([{ payee: 'Co.opmart', categoryId: 'c-groceries' }])
    const { user, drawer } = await quickAdd()

    await choose(user, drawer.getByLabelText('Category'), 'Transport')
    await user.type(drawer.getByLabelText('Payee'), 'Co.opmart')
    await user.tab()

    // Long enough for the suggestion to have arrived.
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(drawer.getByLabelText('Category')).toHaveValue('Transport')
    expect(drawer.getByLabelText('Category')).not.toHaveAccessibleDescription()
  })

  it('has a type-ahead category picker: typing narrows it, whatever the case or accents, and the arrows and Enter choose', async () => {
    fakeApis([], undefined, [
      ...defaultTestCategories,
      { id: 'c-an-uong', parentId: null, name: 'Ăn uống', kind: 'expense', icon: 'utensils', color: '#f97316', isArchived: false },
      { id: 'c-di-cho', parentId: 'c-an-uong', name: 'Đi chợ', kind: 'expense', icon: 'utensils', color: '#f97316', isArchived: false },
    ])
    const { user, drawer } = await quickAdd()
    const category = drawer.getByLabelText('Category')
    const offered = () => within(screen.getByRole('listbox')).queryAllByRole('option').map((option) => option.textContent)

    expect(category).toHaveRole('combobox')
    expect(await offeredBy(user, category)).toEqual(['Food & drink', 'Food & drink › Groceries', 'Food & drink › Eating out', 'Transport', 'Ăn uống', 'Ăn uống › Đi chợ'])

    await user.type(category, 'FOOD')
    expect(offered()).toEqual(['Food & drink', 'Food & drink › Groceries', 'Food & drink › Eating out'])
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}{Enter}')
    expect(category).toHaveValue('Food & drink › Groceries')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    await user.clear(category)
    await user.type(category, 'di cho')
    expect(offered()).toEqual(['Ăn uống › Đi chợ'])
    // Leaving the field takes the match, as Enter does.
    await user.tab()
    expect(category).toHaveValue('Ăn uống › Đi chợ')
  })

  it('says when no category matches, and keeps the one chosen before', async () => {
    fakeApis()
    const { user, drawer } = await quickAdd()
    const category = drawer.getByLabelText('Category')
    await choose(user, category, 'Transport')

    // Typed over the name of the one chosen.
    await user.type(category, 'holidays', { initialSelectionStart: 0, initialSelectionEnd: 'Transport'.length })
    expect(screen.getByText('No category matches.')).toBeInTheDocument()
    expect(within(screen.getByRole('listbox')).queryAllByRole('option')).toEqual([])

    // Escape closes the picker, not the drawer.
    await user.keyboard('{Escape}')
    expect(category).toHaveValue('Transport')
    expect(screen.getByRole('dialog', { name: 'New transaction' })).toBeInTheDocument()
  })
})
