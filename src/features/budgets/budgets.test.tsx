import { screen, waitFor, within } from '@testing-library/react'
import { http } from 'msw'
import { describe, expect, it } from 'vitest'
import { todayIn } from '@/shared/dates'
import { fakeAccountsApi } from '@/test/fakeAccountsApi'
import { fakeBudgetsApi } from '@/test/fakeBudgetsApi'
import { defaultTestCategories, fakeCategoriesApi } from '@/test/fakeCategoriesApi'
import { fakeInstitutionsApi } from '@/test/fakeInstitutionsApi'
import { fakeProfileApi } from '@/test/fakeProfileApi'
import { fakeTransactionsApi } from '@/test/fakeTransactionsApi'
import { renderApp } from '@/test/renderApp'
import { apiUrl, problem, server } from '@/test/server'

const budgetList = () => screen.findByRole('list', { name: 'Budgets by category' })
const row = async (name: string) => within(await budgetList()).getByRole('listitem', { name })
const copyStatus = () => screen.getByRole('status')
const amountOf = (item: HTMLElement, name: string) => within(item).getByRole('textbox', { name: `Budget for ${name}` })

/** November 2026: Food & drink on track with its subcategories' spending, Transport at a warning. */
function november() {
  const profile = fakeProfileApi({ locale: 'en' })
  const categories = fakeCategoriesApi()
  const budgets = fakeBudgetsApi({
    profile,
    categories: categories.categories,
    budgets: [
      { month: '2026-11', categoryId: 'c-food', amount: '3000000' },
      { month: '2026-11', categoryId: 'c-transport', amount: '500000' },
      { month: '2026-10', categoryId: 'c-groceries', amount: '1000000' },
    ],
    spending: {
      '2026-11': { 'c-food': { spent: '200000' }, 'c-groceries': { spent: '1250000' }, 'c-eating-out': { spent: '400000' }, 'c-transport': { spent: '450000' } },
      '2026-10': { 'c-groceries': { spent: '1200000.00' } },
    },
  })
  return { profile, categories, budgets }
}

describe('the budget screen', () => {
  it('shows budgeted, spent, remaining and progress for each budget of the month, with totals', async () => {
    november()
    renderApp('/budgets/2026-11')

    expect(await screen.findByRole('heading', { level: 1, name: 'Budgets' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'November 2026' })).toBeInTheDocument()

    const food = await row('Food & drink')
    expect(amountOf(food, 'Food & drink')).toHaveValue('3,000,000')
    expect(within(food).getByText('Spent').parentElement).toHaveTextContent('Spent₫1,850,000')
    expect(within(food).getByText('Remaining').parentElement).toHaveTextContent('Remaining₫1,150,000')
    const progress = within(food).getByRole('progressbar', { name: 'Food & drink: 61% of the budget spent' })
    expect(progress).toHaveAttribute('aria-valuenow', '61')

    const totals = screen.getByRole('group', { name: 'Totals for November 2026' })
    expect(within(totals).getByText('Budgeted').parentElement).toHaveTextContent('Budgeted₫3,500,000')
    expect(within(totals).getByText('Spent').parentElement).toHaveTextContent('Spent₫2,300,000')
    expect(within(totals).getByText('Remaining').parentElement).toHaveTextContent('Remaining₫1,200,000')
  })

  it('says each state in words, never by colour alone', async () => {
    const profile = fakeProfileApi({ locale: 'en' })
    const categories = [...defaultTestCategories, { id: 'c-pets', parentId: null, name: 'Pets', kind: 'expense' as const, icon: 'paw-print', color: '#a16207', isArchived: false }]
    fakeCategoriesApi({ categories })
    fakeBudgetsApi({
      profile,
      categories,
      budgets: [
        { month: '2026-11', categoryId: 'c-food', amount: '3000000' },
        { month: '2026-11', categoryId: 'c-transport', amount: '500000' },
        { month: '2026-11', categoryId: 'c-pets', amount: '100000' },
      ],
      spending: { '2026-11': { 'c-food': { spent: '200000' }, 'c-transport': { spent: '450000' }, 'c-pets': { spent: '250000' } } },
    })
    renderApp('/budgets/2026-11')

    expect(within(await row('Food & drink')).getByText('On track')).toBeInTheDocument()
    expect(within(await row('Transport')).getByText('Warning')).toBeInTheDocument()
    const pets = await row('Pets')
    expect(within(pets).getByText('Over budget')).toBeInTheDocument()
    // The bar is full, and the figure says by how much the budget is passed.
    expect(within(pets).getByRole('progressbar', { name: 'Pets: 250% of the budget spent' })).toHaveAttribute('aria-valuenow', '100')
    expect(within(pets).getByText('Remaining').parentElement).toHaveTextContent('Remaining-₫150,000')
  })

  it('lists every expense category, budgeted or not, and no income category', async () => {
    november()
    renderApp('/budgets/2026-10')

    const list = await budgetList()
    await waitFor(() => expect(amountOf(within(list).getByRole('listitem', { name: 'Groceries' }), 'Groceries')).toHaveValue('1,000,000'))
    expect(amountOf(within(list).getByRole('listitem', { name: 'Transport' }), 'Transport')).toHaveValue('')
    expect(within(within(list).getByRole('listitem', { name: 'Transport' })).queryByRole('progressbar')).not.toBeInTheDocument()
    expect(within(list).queryByRole('listitem', { name: 'Salary' })).not.toBeInTheDocument()
  })

  it('sets a budget by typing its amount next to the category', async () => {
    const { budgets, profile } = november()
    const { user } = renderApp('/budgets/2026-12')

    const transport = await row('Transport')
    await user.type(amountOf(transport, 'Transport'), '600000')
    await user.click(within(transport).getByRole('button', { name: 'Save the budget for Transport' }))

    expect(await within(transport).findByText('On track')).toBeInTheDocument()
    expect(budgets.requests).toEqual([{ method: 'PUT', month: '2026-12', categoryId: 'c-transport', body: { amount: '600000' }, ifMatch: null }])
    expect(amountOf(transport, 'Transport')).toHaveValue('600,000')
    expect(within(transport).queryByRole('button', { name: 'Save the budget for Transport' })).not.toBeInTheDocument()
    // The first budget locks the base currency, so the profile is asked for again.
    await waitFor(() => expect(profile.reads).toBe(2))
  })

  it('changes a budget’s amount with Enter, from the row version it was read at', async () => {
    const { budgets } = november()
    const { user } = renderApp('/budgets/2026-11')

    const food = await row('Food & drink')
    await user.clear(amountOf(food, 'Food & drink'))
    await user.type(amountOf(food, 'Food & drink'), '3500000{Enter}')

    await waitFor(() => expect(within(food).getByText('Remaining').parentElement).toHaveTextContent('Remaining₫1,650,000'))
    expect(budgets.requests).toEqual([{ method: 'PUT', month: '2026-11', categoryId: 'c-food', body: { amount: '3500000' }, ifMatch: '"1"' }])
  })

  it('removes a budget', async () => {
    const { budgets } = november()
    const { user } = renderApp('/budgets/2026-11')

    const transport = await row('Transport')
    await user.click(within(transport).getByRole('button', { name: 'Remove the budget for Transport' }))

    await waitFor(() => expect(amountOf(transport, 'Transport')).toHaveValue(''))
    expect(budgets.requests).toEqual([{ method: 'DELETE', month: '2026-11', categoryId: 'c-transport' }])
    expect(within(transport).queryByRole('progressbar')).not.toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Totals for November 2026' })).getByText('Budgeted').parentElement).toHaveTextContent('₫3,000,000')
  })

  it('removes a budget whose amount is cleared and saved', async () => {
    const { budgets } = november()
    const { user } = renderApp('/budgets/2026-11')

    const transport = await row('Transport')
    await user.clear(amountOf(transport, 'Transport'))
    await user.click(within(transport).getByRole('button', { name: 'Save the budget for Transport' }))

    await waitFor(() => expect(budgets.requests).toEqual([{ method: 'DELETE', month: '2026-11', categoryId: 'c-transport' }]))
  })

  it('refuses an amount the base currency does not take before anything is sent', async () => {
    const { budgets } = november()
    const { user } = renderApp('/budgets/2026-11')

    const transport = await row('Transport')
    await user.clear(amountOf(transport, 'Transport'))
    await user.type(amountOf(transport, 'Transport'), '500000.50{Enter}')

    expect(await within(transport).findByText('Enter an amount of zero or more, such as 1,250,000.')).toBeInTheDocument()
    expect(amountOf(transport, 'Transport')).toBeInvalid()
    expect(budgets.requests).toEqual([])
  })

  it('offers no budget on a subcategory whose parent has one, nor on a parent whose subcategory has one', async () => {
    november()
    const { user } = renderApp('/budgets/2026-11')

    const groceries = await row('Groceries')
    expect(within(groceries).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(groceries).getByText('Counts toward the budget for Food & drink.')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Previous month: October 2026' }))
    const food = await row('Food & drink')
    await waitFor(() => expect(within(food).queryByRole('textbox', { name: 'Budget for Food & drink' })).not.toBeInTheDocument())
    expect(within(food).getByText('Its subcategories have budgets of their own this month.')).toBeInTheDocument()
    expect(amountOf(await row('Eating out'), 'Eating out')).toHaveValue('')
  })

  it('copies last month’s budgets into the month shown in one action, and says how many were copied', async () => {
    const { budgets, profile } = november()
    const { user } = renderApp('/budgets/2026-12')

    await user.click(await screen.findByRole('button', { name: 'Copy budgets from November 2026' }))

    await waitFor(() => expect(copyStatus()).toHaveTextContent('2 budgets copied from November 2026.'))
    expect(budgets.copies).toEqual([{ month: '2026-12', sourceMonth: '2026-11' }])
    await waitFor(() => expect(amountOf(screen.getByRole('listitem', { name: 'Food & drink' }), 'Food & drink')).toHaveValue('3,000,000'))
    expect(amountOf(await row('Transport'), 'Transport')).toHaveValue('500,000')
    // The first budget locks the base currency, so the profile is asked for again.
    await waitFor(() => expect(profile.reads).toBe(2))
  })

  it('leaves alone a category already budgeted in the month, and says when nothing was copied', async () => {
    const { budgets } = november()
    const { user } = renderApp('/budgets/2026-11')

    // October's budget is on Groceries, whose parent Food & drink has one in November.
    await user.click(await screen.findByRole('button', { name: 'Copy budgets from October 2026' }))

    await waitFor(() => expect(copyStatus()).toHaveTextContent('No budgets copied from October 2026'))
    expect(budgets.budgets.filter((budget) => budget.month === '2026-11')).toHaveLength(2)
    expect(amountOf(await row('Food & drink'), 'Food & drink')).toHaveValue('3,000,000')
  })

  it('says when copying failed, and tries again', async () => {
    const { budgets } = november()
    const { user } = renderApp('/budgets/2026-12')

    budgets.failWith = 500
    await user.click(await screen.findByRole('button', { name: 'Copy budgets from November 2026' }))

    expect(await screen.findByText('The budgets could not be copied.')).toBeInTheDocument()
    budgets.failWith = undefined
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(copyStatus()).toHaveTextContent('2 budgets copied from November 2026.'))
    expect(screen.queryByText('The budgets could not be copied.')).not.toBeInTheDocument()
  })

  it('says what a copy came to only in the month it was made in', async () => {
    november()
    const { user } = renderApp('/budgets/2026-12')

    await user.click(await screen.findByRole('button', { name: 'Copy budgets from November 2026' }))
    await waitFor(() => expect(copyStatus()).toHaveTextContent('2 budgets copied'))
    await user.click(screen.getByRole('link', { name: 'Next month: January 2027' }))

    expect(await screen.findByRole('button', { name: 'Copy budgets from December 2026' })).toBeInTheDocument()
    expect(copyStatus()).toBeEmptyDOMElement()
  })

  it('moves between months with the month switcher', async () => {
    const { budgets } = november()
    const { user, router } = renderApp('/budgets/2026-11')

    await user.click(await screen.findByRole('link', { name: 'Previous month: October 2026' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'October 2026' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/budgets/2026-10')
    await waitFor(() => expect(budgets.monthsRead).toEqual(['2026-11', '2026-10']))

    await user.click(screen.getByRole('link', { name: 'Next month: November 2026' }))
    await user.click(screen.getByRole('link', { name: 'Next month: December 2026' }))
    await user.click(screen.getByRole('link', { name: 'Next month: January 2027' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'January 2027' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Previous month: December 2026' })).toHaveAttribute('href', '/budgets/2026-12')
  })

  it('opens on the month it is now in the user’s time zone, and returns to it from another month', async () => {
    fakeProfileApi({ locale: 'en', timeZone: 'Pacific/Kiritimati' })
    fakeCategoriesApi()
    const budgets = fakeBudgetsApi()
    const thisMonth = todayIn('Pacific/Kiritimati').slice(0, 7)
    const { user, router } = renderApp('/budgets')

    await budgetList()
    expect(budgets.monthsRead).toEqual([thisMonth])
    expect(screen.queryByRole('link', { name: 'This month' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: /^Previous month/ }))
    await user.click(await screen.findByRole('link', { name: 'This month' }))
    expect(router.state.location.pathname).toBe('/budgets')
  })

  it('shows the current month when the address names something that is not a month', async () => {
    fakeProfileApi({ locale: 'en' })
    fakeCategoriesApi()
    const budgets = fakeBudgetsApi()
    renderApp('/budgets/2026-13')

    await budgetList()
    expect(budgets.monthsRead).toEqual([todayIn('Asia/Ho_Chi_Minh').slice(0, 7)])
  })

  it('says so when a month has no budgets yet', async () => {
    november()
    renderApp('/budgets/2027-03')

    expect(await screen.findByText('No budgets for this month yet. Enter an amount next to a category to set one.')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /^Totals/ })).not.toBeInTheDocument()
  })

  it('flags expenses that are not converted and so are left out of spent', async () => {
    const profile = fakeProfileApi({ locale: 'en' })
    const categories = fakeCategoriesApi()
    fakeBudgetsApi({
      profile,
      categories: categories.categories,
      budgets: [
        { month: '2026-11', categoryId: 'c-food', amount: '3000000' },
        { month: '2026-11', categoryId: 'c-transport', amount: '500000' },
      ],
      spending: { '2026-11': { 'c-groceries': { spent: '250000', notConverted: 2 }, 'c-transport': { spent: '0', notConverted: 1 } } },
    })
    renderApp('/budgets/2026-11')

    expect(within(await row('Food & drink')).getByRole('note')).toHaveTextContent('2 expenses are not converted yet and are left out of spent.')
    expect(within(await row('Transport')).getByRole('note')).toHaveTextContent('1 expense is not converted yet and is left out of spent.')
    expect(within(screen.getByRole('group', { name: 'Totals for November 2026' })).getByRole('note')).toHaveTextContent('3 expenses are not converted yet')
  })

  it('opens the transactions behind a budget: its category and subcategories in its month, coming to its spent', async () => {
    const { categories } = november()
    fakeInstitutionsApi()
    const accounts = fakeAccountsApi([{ name: 'Everyday', openingBalance: '5000000.00' }])
    const everyday = accounts.accounts[0]!.id
    fakeTransactionsApi(
      [
        { accountId: everyday, amount: '200000.00', date: '2026-11-03', categoryId: 'c-food', payee: 'Phở Thìn' },
        {
          accountId: everyday,
          amount: '1500000.00',
          date: '2026-11-08',
          payee: 'Aeon',
          lines: [
            { categoryId: 'c-groceries', amount: '1300000.00', note: null },
            { categoryId: 'c-transport', amount: '200000.00', note: null },
          ],
        },
        { accountId: everyday, amount: '500000.00', date: '2026-11-12', categoryId: 'c-eating-out', payee: 'Pizza 4P’s' },
        { accountId: everyday, amount: '50000.00', date: '2026-11-15', categoryId: 'c-groceries', payee: 'Co.opmart refund', isRefund: true },
        { accountId: everyday, amount: '100000.00', date: '2026-11-16', categoryId: 'c-eating-out', payee: 'Refund', isRefund: true },
        { accountId: everyday, amount: '80000.00', date: '2026-10-30', categoryId: 'c-groceries', payee: 'Last month' },
        { accountId: everyday, amount: '250000.00', date: '2026-11-04', categoryId: 'c-transport', payee: 'Grab' },
      ],
      { accounts: accounts.accounts, categories: categories.categories },
    )
    const { user, router } = renderApp('/budgets/2026-11')

    const food = await row('Food & drink')
    expect(within(food).getByText('Spent').parentElement).toHaveTextContent('Spent₫1,850,000')
    await user.click(within(food).getByRole('link', { name: 'See transactions behind Food & drink in November 2026' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Transactions' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/transactions')
    expect(Object.fromEntries(new URLSearchParams(router.state.location.search))).toEqual({ categoryId: 'c-food', from: '2026-11-01', to: '2026-11-30' })
    const list = await screen.findByRole('list', { name: 'Transactions' })
    await waitFor(() =>
      expect(within(list).getAllByRole('heading').map((heading) => heading.textContent)).toEqual(['Refund', 'Co.opmart refund', 'Pizza 4P’s', 'Aeon', 'Phở Thìn']),
    )
    // 200,000 + 1,300,000 of the split + 500,000 - 50,000 - 100,000: the budget row's spent.
    const total = within(screen.getByRole('region', { name: 'Total of these transactions' }))
    expect(total.getByText('Spent in the category, as its budget counts it').parentElement).toHaveTextContent('₫1,850,000')
  })

  it('opens the transactions behind a budget from anywhere on its row but its controls', async () => {
    november()
    const { user, router } = renderApp('/budgets/2026-11')

    const transport = await row('Transport')
    await user.click(amountOf(transport, 'Transport'))
    expect(router.state.location.pathname).toBe('/budgets/2026-11')
    await user.click(within(transport).getByText('Remaining'))
    expect(router.state.location.pathname).toBe('/transactions')
    expect(Object.fromEntries(new URLSearchParams(router.state.location.search))).toEqual({ categoryId: 'c-transport', from: '2026-11-01', to: '2026-11-30' })
  })

  it('keeps a row with no budget where it is when clicked', async () => {
    november()
    const { user, router } = renderApp('/budgets/2026-11')

    await user.click(within(await row('Groceries')).getByText('Groceries'))
    expect(router.state.location.pathname).toBe('/budgets/2026-11')
  })

  it('offers no transactions to drill into from a category with no budget of its own', async () => {
    november()
    renderApp('/budgets/2026-11')

    expect(within(await row('Groceries')).queryByRole('link')).not.toBeInTheDocument()
  })

  it('shows the latest budget when it was changed somewhere else, for the user to check and save again', async () => {
    const { budgets } = november()
    const { user } = renderApp('/budgets/2026-11')

    const food = await row('Food & drink')
    Object.assign(budgets.budgets[0]!, { amount: '2000000', rowVersion: '2' })
    await user.clear(amountOf(food, 'Food & drink'))
    await user.type(amountOf(food, 'Food & drink'), '3500000{Enter}')

    expect(await within(food).findByText('This budget was changed somewhere else. The latest amount is shown; check it and save again.')).toBeInTheDocument()
    await waitFor(() => expect(amountOf(food, 'Food & drink')).toHaveValue('2,000,000'))

    await user.clear(amountOf(food, 'Food & drink'))
    await user.type(amountOf(food, 'Food & drink'), '3500000{Enter}')
    await waitFor(() => expect(budgets.requests.at(-1)).toMatchObject({ body: { amount: '3500000' }, ifMatch: '"2"' }))
  })

  it('says when a change failed, and tries again', async () => {
    const { budgets } = november()
    const { user } = renderApp('/budgets/2026-11')

    const transport = await row('Transport')
    budgets.failWith = 500
    await user.clear(amountOf(transport, 'Transport'))
    await user.type(amountOf(transport, 'Transport'), '700000{Enter}')

    expect(await screen.findByText('The budget could not be saved.')).toBeInTheDocument()
    budgets.failWith = undefined
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(budgets.budgets.find((budget) => budget.categoryId === 'c-transport')?.amount).toBe('700000'))
    expect(screen.queryByText('The budget could not be saved.')).not.toBeInTheDocument()
  })

  it('shows a budget on a category that has since been archived', async () => {
    const profile = fakeProfileApi({ locale: 'en' })
    const categories = defaultTestCategories.map((category) => (category.id === 'c-transport' ? { ...category, isArchived: true } : category))
    fakeCategoriesApi({ categories })
    fakeBudgetsApi({ profile, categories, budgets: [{ month: '2026-11', categoryId: 'c-transport', amount: '500000' }] })
    renderApp('/budgets/2026-11')

    const transport = await row('Transport')
    await waitFor(() => expect(amountOf(transport, 'Transport')).toHaveValue('500,000'))
    expect(within(transport).getByText('Archived')).toBeInTheDocument()
  })

  it('sets an overall budget for the month, which tracks all of its spending', async () => {
    const { budgets, profile } = november()
    const { user } = renderApp('/budgets/2026-11')

    const overall = await screen.findByRole('group', { name: 'Overall budget for November 2026' })
    await user.type(within(overall).getByRole('textbox', { name: 'Overall budget' }), '4000000{Enter}')

    // Every category's spending counts, budgeted or not: 200,000 + 1,250,000 + 400,000 + 450,000.
    await waitFor(() => expect(within(overall).getByText('Spent').parentElement).toHaveTextContent('Spent₫2,300,000'))
    expect(within(overall).getByText('Remaining').parentElement).toHaveTextContent('Remaining₫1,700,000')
    expect(within(overall).getByRole('progressbar', { name: 'Overall budget: 57% of the budget spent' })).toBeInTheDocument()
    expect(within(overall).getByText('On track')).toBeInTheDocument()
    expect(budgets.requests).toEqual([{ method: 'PUT', month: '2026-11', categoryId: 'overall', body: { amount: '4000000' }, ifMatch: null }])
    // It is not one of the category budgets, so their totals stay as they were.
    expect(within(screen.getByRole('group', { name: 'Totals for November 2026' })).getByText('Budgeted').parentElement).toHaveTextContent('₫3,500,000')
    await waitFor(() => expect(profile.reads).toBe(2))
  })

  it('changes the overall budget from the row version it was read at, and removes it leaving the category budgets', async () => {
    const profile = fakeProfileApi({ locale: 'en' })
    const categories = fakeCategoriesApi()
    const budgets = fakeBudgetsApi({
      profile,
      categories: categories.categories,
      budgets: [{ month: '2026-11', categoryId: 'c-transport', amount: '500000' }],
      overall: [{ month: '2026-11', amount: '4000000' }],
    })
    const { user } = renderApp('/budgets/2026-11')

    const overall = await screen.findByRole('group', { name: 'Overall budget for November 2026' })
    const amount = within(overall).getByRole('textbox', { name: 'Overall budget' })
    await waitFor(() => expect(amount).toHaveValue('4,000,000'))
    await user.clear(amount)
    await user.type(amount, '5000000')
    await user.click(within(overall).getByRole('button', { name: 'Save the overall budget' }))
    await waitFor(() => expect(within(overall).getByText('Remaining').parentElement).toHaveTextContent('Remaining₫5,000,000'))

    await user.click(within(overall).getByRole('button', { name: 'Remove the overall budget' }))

    await waitFor(() => expect(amount).toHaveValue(''))
    expect(within(overall).queryByRole('progressbar')).not.toBeInTheDocument()
    expect(budgets.requests).toEqual([
      { method: 'PUT', month: '2026-11', categoryId: 'overall', body: { amount: '5000000' }, ifMatch: '"1"' },
      { method: 'DELETE', month: '2026-11', categoryId: 'overall' },
    ])
    expect(amountOf(await row('Transport'), 'Transport')).toHaveValue('500,000')
  })

  it('shows the pace of each budget and of the overall budget in the current month, against the share of the month elapsed', async () => {
    const profile = fakeProfileApi({ locale: 'en' })
    const categories = fakeCategoriesApi()
    fakeBudgetsApi({
      profile,
      categories: categories.categories,
      today: '2026-11-15',
      budgets: [
        { month: '2026-11', categoryId: 'c-food', amount: '3000000' },
        { month: '2026-11', categoryId: 'c-transport', amount: '500000' },
      ],
      overall: [{ month: '2026-11', amount: '4000000' }],
      spending: { '2026-11': { 'c-groceries': { spent: '1200000' }, 'c-transport': { spent: '450000' } } },
    })
    renderApp('/budgets/2026-11')

    expect(await screen.findByText('50% of the month has passed.')).toBeInTheDocument()
    // 40% of Food & drink is spent with half the month gone; 90% of Transport.
    expect(within(await row('Food & drink')).getByText('On pace')).toBeInTheDocument()
    expect(within(await row('Transport')).getByText('Ahead of pace')).toBeInTheDocument()
    const overall = screen.getByRole('group', { name: 'Overall budget for November 2026' })
    expect(within(overall).getByText('On pace')).toBeInTheDocument()
  })

  it('shows a past month’s final result with no pace', async () => {
    const profile = fakeProfileApi({ locale: 'en' })
    const categories = fakeCategoriesApi()
    fakeBudgetsApi({
      profile,
      categories: categories.categories,
      today: '2026-12-03',
      budgets: [{ month: '2026-11', categoryId: 'c-transport', amount: '500000' }],
      overall: [{ month: '2026-11', amount: '4000000' }],
      spending: { '2026-11': { 'c-transport': { spent: '450000' } } },
    })
    renderApp('/budgets/2026-11')

    expect(within(await row('Transport')).getByText('Warning')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Overall budget for November 2026' })).toHaveTextContent('₫450,000')
    expect(screen.queryByText(/pace/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/of the month has passed/)).not.toBeInTheDocument()
  })

  it('says when the budgets could not be loaded', async () => {
    fakeProfileApi({ locale: 'en' })
    fakeCategoriesApi()
    server.use(http.get(apiUrl('/api/v1/budgets'), () => problem(500)))
    renderApp('/budgets/2026-11')

    expect(await screen.findByRole('alert')).toHaveTextContent('The budgets could not be loaded.')
  })

  it('is written in Vietnamese for a user whose locale it is', async () => {
    const profile = fakeProfileApi({ locale: 'vi' })
    const categories = fakeCategoriesApi()
    fakeBudgetsApi({ profile, categories: categories.categories, budgets: [{ month: '2026-11', categoryId: 'c-transport', amount: '500000' }] })
    renderApp('/budgets/2026-11', { language: 'vi' })

    expect(await screen.findByRole('heading', { level: 2, name: 'tháng 11 năm 2026' })).toBeInTheDocument()
    expect(within(await screen.findByRole('listitem', { name: 'Transport' })).getByText('Đúng kế hoạch')).toBeInTheDocument()
  })
})
