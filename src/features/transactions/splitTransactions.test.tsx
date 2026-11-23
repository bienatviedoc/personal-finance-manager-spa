import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeAccountsApi } from '@/test/fakeAccountsApi'
import { defaultTestCategories, fakeCategoriesApi } from '@/test/fakeCategoriesApi'
import { fakeInstitutionsApi } from '@/test/fakeInstitutionsApi'
import { fakeTransactionsApi } from '@/test/fakeTransactionsApi'
import { renderApp } from '@/test/renderApp'

const everyday = '01970000-0000-7000-8000-200000000000'

/** Today in the test user's time zone, which is as late as a transaction can be dated. */
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

function fakeApis(transactions: Parameters<typeof fakeTransactionsApi>[0] = []) {
  fakeInstitutionsApi()
  const accountsApi = fakeAccountsApi([
    { name: 'Everyday', openingBalance: '1000000.00' },
    { name: 'Savings in dollars', currency: 'USD', openingBalance: '100.00' },
  ])
  const categoriesApi = fakeCategoriesApi({ categories: defaultTestCategories })
  const transactionsApi = fakeTransactionsApi(transactions, { accounts: accountsApi.accounts, categories: categoriesApi.categories, today })
  return { accountsApi, categoriesApi, transactionsApi }
}

const aSplit = {
  accountId: everyday,
  amount: '500000.00',
  date: '2026-11-02',
  payee: 'Co.opmart',
  rowVersion: '3',
  lines: [
    { categoryId: 'c-groceries', amount: '320000.00', note: 'food' },
    { categoryId: 'c-transport', amount: '180000.00', note: null },
  ],
}

/** The lines the list shows under a split transaction: each one's category, amount and note. */
function listedLines(name: string) {
  return within(screen.getByRole('list', { name, hidden: true }))
    .getAllByRole('listitem', { hidden: true })
    .map((line) => line.textContent)
}

async function openNewDrawer(user: ReturnType<typeof renderApp>['user']) {
  await user.click(await screen.findByRole('button', { name: 'Add transaction' }))
  return within(screen.getByRole('dialog', { name: 'New transaction' }))
}

describe('split transactions', () => {
  it('are listed as split, with each line’s category, amount and note under them', async () => {
    fakeApis([aSplit])
    renderApp('/transactions')

    const list = await screen.findByRole('list', { name: 'Transactions' })
    expect(within(list).getByRole('heading', { name: 'Co.opmart' })).toBeInTheDocument()
    expect(within(list).getByTestId('details')).toHaveTextContent('Split · Everyday · Nov 2, 2026')
    expect(within(list).getByTestId('amount')).toHaveTextContent('-₫500,000')
    expect(listedLines('Lines of Co.opmart')).toEqual(['Groceries · ₫320,000 · food', 'Transport · ₫180,000'])
  })

  it('are recorded by splitting the amount across lines; the form shows what remains and saves only once nothing does', async () => {
    const { transactionsApi } = fakeApis()
    const { user } = renderApp('/transactions')
    const drawer = await openNewDrawer(user)
    await user.type(drawer.getByLabelText('Amount (VND)'), '500,000')
    await user.clear(drawer.getByLabelText('Date'))
    await user.type(drawer.getByLabelText('Date'), '2026-11-02')
    // Chosen by its id: the name has an ampersand, which an option's markup writes differently.
    await user.selectOptions(drawer.getByLabelText('Category'), 'c-groceries')

    await user.click(drawer.getByRole('button', { name: 'Split across categories' }))

    // The category already chosen becomes the first line's; the one field for it is gone.
    expect(drawer.queryByLabelText('Category')).not.toBeInTheDocument()
    expect(drawer.getByLabelText('Line 1 category')).toHaveDisplayValue('Food & drink › Groceries')
    expect(drawer.getByLabelText('Line 2 category')).toHaveDisplayValue('Choose a category')
    expect(drawer.getByTestId('remaining')).toHaveTextContent('₫500,000 left to split')
    await user.type(drawer.getByLabelText('Line 1 amount (VND)'), '320,000')
    await user.type(drawer.getByLabelText('Line 1 note'), 'food')
    await user.selectOptions(drawer.getByLabelText('Line 2 category'), 'Transport')
    await user.type(drawer.getByLabelText('Line 2 amount (VND)'), '170,000')
    expect(drawer.getByTestId('remaining')).toHaveTextContent('₫10,000 left to split')

    await user.click(drawer.getByRole('button', { name: 'Save' }))
    expect(await drawer.findByRole('alert')).toHaveTextContent('The lines must add up to the amount: ₫10,000 left to split.')
    expect(transactionsApi.requests).toEqual([])

    await user.clear(drawer.getByLabelText('Line 2 amount (VND)'))
    await user.type(drawer.getByLabelText('Line 2 amount (VND)'), '180,000')
    expect(drawer.getByTestId('remaining')).toHaveTextContent('Nothing left to split')
    expect(drawer.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(drawer.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(transactionsApi.transactions).toHaveLength(1))
    expect(transactionsApi.requests).toEqual([
      {
        method: 'POST',
        body: {
          type: 'expense',
          accountId: everyday,
          amount: '500000',
          date: '2026-11-02',
          payee: null,
          note: null,
          isRefund: false,
          lines: [
            { categoryId: 'c-groceries', amount: '320000', note: 'food' },
            { categoryId: 'c-transport', amount: '180000', note: null },
          ],
        },
      },
    ])
    expect(within(screen.getByRole('list', { name: 'Transactions', hidden: true })).getByRole('heading', { hidden: true })).toHaveTextContent('Split transaction')
    expect(listedLines('Lines of Split transaction')).toEqual(['Groceries · ₫320,000 · food', 'Transport · ₫180,000'])
  })

  it('say by how much the lines come to more than the amount, and do not save', async () => {
    const { transactionsApi } = fakeApis()
    const { user } = renderApp('/transactions')
    const drawer = await openNewDrawer(user)
    await user.type(drawer.getByLabelText('Amount (VND)'), '500,000')
    await user.click(drawer.getByRole('button', { name: 'Split across categories' }))
    await user.selectOptions(drawer.getByLabelText('Line 1 category'), 'Transport')
    await user.type(drawer.getByLabelText('Line 1 amount (VND)'), '320,000')
    await user.selectOptions(drawer.getByLabelText('Line 2 category'), 'c-food')
    await user.type(drawer.getByLabelText('Line 2 amount (VND)'), '200,000')

    expect(drawer.getByTestId('remaining')).toHaveTextContent('₫20,000 more than the amount')
    await user.click(drawer.getByRole('button', { name: 'Save' }))

    expect(await drawer.findByRole('alert')).toHaveTextContent('The lines must add up to the amount: they come to ₫20,000 more.')
    expect(transactionsApi.requests).toEqual([])
  })

  it('need a category of the transaction’s type and an amount above zero on every line', async () => {
    const { transactionsApi } = fakeApis()
    const { user } = renderApp('/transactions')
    const drawer = await openNewDrawer(user)
    await user.type(drawer.getByLabelText('Amount (VND)'), '500,000')
    await user.click(drawer.getByRole('button', { name: 'Split across categories' }))
    const offered = () => within(drawer.getByLabelText('Line 2 category')).getAllByRole('option').map((option) => option.textContent)

    expect(offered()).toEqual(['Choose a category', 'Food & drink', 'Food & drink › Groceries', 'Food & drink › Eating out', 'Transport'])
    await user.selectOptions(drawer.getByLabelText('Line 1 category'), 'Transport')
    await user.type(drawer.getByLabelText('Line 1 amount (VND)'), '500,000')
    await user.type(drawer.getByLabelText('Line 2 amount (VND)'), '0')
    await user.click(drawer.getByRole('button', { name: 'Save' }))

    expect(await drawer.findByText('Choose a category.')).toBeInTheDocument()
    expect(drawer.getByLabelText('Line 2 category')).toHaveAccessibleDescription('Choose a category.')
    expect(drawer.getByLabelText('Line 2 amount (VND)')).toHaveAccessibleDescription('Enter an amount greater than zero.')
    expect(transactionsApi.requests).toEqual([])

    // The type decides which kind of category a line takes: one of the other kind cannot stay.
    await user.click(drawer.getByRole('radio', { name: 'Income' }))
    expect(offered()).toEqual(['Choose a category', 'Salary', 'Investments', 'Investments › Interest'])
    expect(drawer.getByLabelText('Line 1 category')).toHaveDisplayValue('Choose a category')
  })

  it('take more lines, and let one go while more than two are left', async () => {
    const { transactionsApi } = fakeApis()
    const { user } = renderApp('/transactions')
    const drawer = await openNewDrawer(user)
    await user.selectOptions(drawer.getByLabelText('Account'), 'Savings in dollars (USD)')
    await user.type(drawer.getByLabelText('Amount (USD)'), '100')
    await user.click(drawer.getByRole('button', { name: 'Split across categories' }))
    expect(drawer.queryByRole('button', { name: 'Remove line 1' })).not.toBeInTheDocument()

    await user.click(drawer.getByRole('button', { name: 'Add a line' }))
    await user.click(drawer.getByRole('button', { name: 'Add a line' }))
    for (const [line, category, amount] of [
      [1, 'Transport', '33.33'],
      [2, 'c-food', '50'],
      [3, 'c-groceries', '33.33'],
      [4, 'c-eating-out', '33.34'],
    ] as const) {
      await user.selectOptions(drawer.getByLabelText(`Line ${line} category`), category)
      await user.type(drawer.getByLabelText(`Line ${line} amount (USD)`), amount)
    }
    expect(drawer.getByTestId('remaining')).toHaveTextContent('$50.00 more than the amount')
    await user.click(drawer.getByRole('button', { name: 'Remove line 2' }))

    expect(drawer.getByTestId('remaining')).toHaveTextContent('Nothing left to split')
    expect(drawer.queryByLabelText('Line 4 category')).not.toBeInTheDocument()
    await user.click(drawer.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(transactionsApi.transactions).toHaveLength(1))
    expect(transactionsApi.transactions[0]?.lines).toEqual([
      { categoryId: 'c-transport', amount: '33.33', note: null },
      { categoryId: 'c-groceries', amount: '33.33', note: null },
      { categoryId: 'c-eating-out', amount: '33.34', note: null },
    ])
  })

  it('open for editing with their lines, which can be changed', async () => {
    const { transactionsApi } = fakeApis([aSplit])
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('button', { name: 'Edit Co.opmart' }))
    const drawer = within(screen.getByRole('dialog', { name: 'Edit transaction' }))
    expect(drawer.getByLabelText('Line 1 category')).toHaveDisplayValue('Food & drink › Groceries')
    expect(drawer.getByLabelText('Line 1 amount (VND)')).toHaveValue('320,000')
    expect(drawer.getByLabelText('Line 1 note')).toHaveValue('food')
    expect(drawer.getByLabelText('Line 2 category')).toHaveDisplayValue('Transport')
    expect(drawer.getByTestId('remaining')).toHaveTextContent('Nothing left to split')
    await user.clear(drawer.getByLabelText('Line 1 amount (VND)'))
    await user.type(drawer.getByLabelText('Line 1 amount (VND)'), '300,000')
    await user.clear(drawer.getByLabelText('Line 2 amount (VND)'))
    await user.type(drawer.getByLabelText('Line 2 amount (VND)'), '200,000')
    await user.click(drawer.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(transactionsApi.ifMatches).toEqual(['"3"'])
    expect(transactionsApi.transactions[0]?.lines).toEqual([
      { categoryId: 'c-groceries', amount: '300000.00', note: 'food' },
      { categoryId: 'c-transport', amount: '200000.00', note: null },
    ])
    expect(listedLines('Lines of Co.opmart')).toEqual(['Groceries · ₫300,000 · food', 'Transport · ₫200,000'])
  })

  it('become one category again, the first line’s unless another is chosen', async () => {
    const { transactionsApi } = fakeApis([aSplit])
    const { user } = renderApp('/transactions')
    await user.click(await screen.findByRole('button', { name: 'Edit Co.opmart' }))
    const drawer = within(screen.getByRole('dialog', { name: 'Edit transaction' }))

    await user.click(drawer.getByRole('button', { name: 'Use one category' }))

    expect(drawer.getByLabelText('Category')).toHaveDisplayValue('Food & drink › Groceries')
    expect(drawer.queryByLabelText('Line 1 category')).not.toBeInTheDocument()
    await user.click(drawer.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(transactionsApi.requests).toEqual([
      {
        method: 'PUT',
        body: { type: 'expense', accountId: everyday, amount: '500000.00', date: '2026-11-02', categoryId: 'c-groceries', payee: 'Co.opmart', note: null, isRefund: false },
      },
    ])
    expect(transactionsApi.transactions[0]?.lines).toEqual([{ categoryId: 'c-groceries', amount: '500000.00', note: null }])
    expect(screen.getByTestId('details')).toHaveTextContent('Groceries · Everyday · Nov 2, 2026')
    expect(screen.queryByRole('list', { name: 'Lines of Co.opmart' })).not.toBeInTheDocument()
  })

  it('say so when the API refuses their lines, and the list goes back to what it was', async () => {
    const { categoriesApi, transactionsApi } = fakeApis([{ payee: 'Earlier', amount: '10.00' }])
    const { user } = renderApp('/transactions')
    const drawer = await openNewDrawer(user)
    await user.type(drawer.getByLabelText('Amount (VND)'), '500,000')
    await user.click(drawer.getByRole('button', { name: 'Split across categories' }))
    await user.selectOptions(drawer.getByLabelText('Line 1 category'), 'c-food')
    await user.type(drawer.getByLabelText('Line 1 amount (VND)'), '320,000')
    await user.selectOptions(drawer.getByLabelText('Line 2 category'), 'Transport')
    await user.type(drawer.getByLabelText('Line 2 amount (VND)'), '180,000')
    // Archived on another device while this drawer is open.
    categoriesApi.categories.find((category) => category.id === 'c-transport')!.isArchived = true

    await user.click(drawer.getByRole('button', { name: 'Save' }))

    expect(await drawer.findByRole('alert')).toHaveTextContent('Check the lines: each needs one of your categories that is not archived and an amount, and together they must add up to the amount.')
    expect(transactionsApi.transactions).toHaveLength(1)
    expect(within(screen.getByRole('list', { name: 'Transactions', hidden: true })).getAllByRole('heading', { hidden: true })).toHaveLength(1)
  })

  it('are written in Vietnamese for a user who reads Vietnamese', async () => {
    fakeApis([aSplit])
    const { user } = renderApp('/transactions', { language: 'vi' })

    expect(await screen.findByTestId('details')).toHaveTextContent('Chia nhiều danh mục')
    await user.click(screen.getByRole('button', { name: 'Sửa Co.opmart' }))
    expect(screen.getByTestId('remaining')).toHaveTextContent('Đã chia hết')
  })
})
