import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeDashboardApi } from '@/test/fakeDashboardApi'
import { fakeProfileApi } from '@/test/fakeProfileApi'
import { renderApp } from '@/test/renderApp'

const category = (id: string, name: string, parentId: string | null = null) => ({ id, parentId, name, icon: 'utensils', color: '#f97316', isArchived: false })
const everyday = { id: 'a-everyday', name: 'Everyday' }
const savings = { id: 'a-savings', name: 'Savings' }

const dashboard = fakeDashboardApi.bind(null, {
  hasAccounts: true,
  balance: { balance: '12000000.00', notConverted: [] },
  thisMonth: { income: '20000000.00', expenses: '5000000.00', net: '15000000.00', savingsRate: 75, notConverted: 0 },
  budgets: {
    budgeted: '4000000.00',
    spent: '3050000.00',
    remaining: '950000.00',
    percentSpent: 76,
    onTrack: 1,
    warning: 2,
    over: 1,
    notConverted: 0,
    overall: null,
    needingAttention: [
      { category: category('c-transport', 'Transport'), budgeted: '1000000.00', spent: '1200000.00', remaining: '-200000.00', percentSpent: 120, state: 'over' },
      { category: category('c-shopping', 'Shopping'), budgeted: '1000000.00', spent: '900000.00', remaining: '100000.00', percentSpent: 90, state: 'warning' },
    ],
  },
  topCategories: [
    { category: category('c-housing', 'Housing'), spent: '4000000.00', share: 69, notConverted: 0 },
    { category: category('c-food', 'Food & drink'), spent: '700000.00', share: 12.1, notConverted: 0 },
  ],
  recentTransactions: [
    { id: 't-in', date: '2026-11-20', type: 'transferIn', account: savings, amount: '500000.00', currency: 'VND', category: null, payee: null, isRefund: false, isSplit: false, transferId: 'tr-1' },
    { id: 't-coffee', date: '2026-11-19', type: 'expense', account: everyday, amount: '45000.00', currency: 'VND', category: category('c-coffee', 'Coffee', 'c-food'), payee: 'Highlands', isRefund: false, isSplit: false, transferId: null },
    { id: 't-refund', date: '2026-11-18', type: 'expense', account: everyday, amount: '300000.00', currency: 'VND', category: category('c-clothes', 'Clothes', 'c-shopping'), payee: null, isRefund: true, isSplit: false, transferId: null },
    { id: 't-pay', date: '2026-11-01', type: 'income', account: everyday, amount: '20000000.00', currency: 'VND', category: category('c-salary', 'Salary'), payee: 'Employer', isRefund: false, isSplit: false, transferId: null },
  ],
  upcoming: [
    { recurringRuleId: 'r-rent', dueDate: '2026-12-01', type: 'expense', account: everyday, amount: '9000000.00', currency: 'VND', category: category('c-rent', 'Rent', 'c-housing'), payee: 'Landlord', isReminder: true },
    { recurringRuleId: 'r-pay', dueDate: '2026-12-05', type: 'income', account: everyday, amount: '20000000.00', currency: 'VND', category: category('c-salary', 'Salary'), payee: null, isReminder: false },
  ],
})

const card = (name: string) => screen.findByRole('region', { name })

describe('the dashboard', () => {
  it('shows the total balance in the base currency, linking to the accounts screen', async () => {
    dashboard()
    renderApp('/')

    const balance = await card('Total balance')
    expect(balance).toHaveTextContent('₫12,000,000')
    expect(within(balance).getByRole('link', { name: 'See accounts' })).toHaveAttribute('href', '/accounts')
  })

  it("shows this month's income, expenses and net, linking to income vs expenses for this month", async () => {
    dashboard()
    renderApp('/')

    const month = await card('This month')
    expect(within(month).getByText('Income').parentElement).toHaveTextContent('₫20,000,000')
    expect(within(month).getByText('Expenses').parentElement).toHaveTextContent('₫5,000,000')
    expect(within(month).getByText('Net').parentElement).toHaveTextContent('₫15,000,000')
    expect(within(month).getByRole('link', { name: 'See income vs expenses' })).toHaveAttribute('href', '/reports/income-vs-expenses?period=thisMonth')
  })

  it('shows budget status: spent of budgeted, how many budgets are in each state, and the ones over or at warning, in words', async () => {
    dashboard()
    renderApp('/')

    const budgets = await card('Budgets this month')
    expect(within(budgets).getByRole('progressbar', { name: '76% of the budget spent' })).toBeInTheDocument()
    expect(budgets).toHaveTextContent('₫3,050,000 spent of ₫4,000,000')
    expect(budgets).toHaveTextContent('1 on track, 2 at warning, 1 over budget')
    const attention = within(budgets).getByRole('list', { name: 'Budgets needing attention' })
    expect(within(attention).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['TransportOver budget120%', 'ShoppingWarning90%'])
    expect(within(budgets).getByRole('link', { name: 'See budgets' })).toHaveAttribute('href', '/budgets')
  })

  it("shows this month's overall budget and its pace beside the category budgets, in words", async () => {
    const shown = dashboard()
    shown.dashboard.budgets = {
      ...shown.dashboard.budgets!,
      overall: { budgeted: '10000000.00', spent: '6000000.00', remaining: '4000000.00', percentSpent: 60, state: 'onTrack', pace: 'aheadOfPace', notConverted: 0 },
    }
    renderApp('/')

    const overall = within(await card('Budgets this month')).getByRole('group', { name: 'Overall budget' })
    expect(overall).toHaveTextContent('₫6,000,000 spent of ₫10,000,000')
    expect(within(overall).getByRole('progressbar', { name: '60% of the budget spent' })).toBeInTheDocument()
    expect(overall).toHaveTextContent('On track')
    expect(overall).toHaveTextContent('Ahead of pace')
  })

  it('shows the overall budget to a user who has no category budget this month', async () => {
    fakeDashboardApi({
      hasAccounts: true,
      budgets: {
        budgeted: '0.00',
        spent: '0.00',
        remaining: '0.00',
        percentSpent: null,
        onTrack: 0,
        warning: 0,
        over: 0,
        notConverted: 0,
        needingAttention: [],
        overall: { budgeted: '10000000.00', spent: '11000000.00', remaining: '-1000000.00', percentSpent: 110, state: 'over', pace: 'aheadOfPace', notConverted: 0 },
      },
    })
    renderApp('/')

    const budgets = await card('Budgets this month')
    const overall = within(budgets).getByRole('group', { name: 'Overall budget' })
    expect(overall).toHaveTextContent('₫11,000,000 spent of ₫10,000,000')
    expect(overall).toHaveTextContent('Over budget')
    expect(budgets).not.toHaveTextContent('No budgets this month.')
    expect(budgets).not.toHaveTextContent('0 on track')
    expect(within(budgets).getByRole('link', { name: 'See budgets' })).toHaveAttribute('href', '/budgets')
  })

  it('offers to set budgets when there is none this month', async () => {
    fakeDashboardApi({ hasAccounts: true })
    renderApp('/')

    const budgets = await card('Budgets this month')
    expect(budgets).toHaveTextContent('No budgets this month.')
    expect(within(budgets).getByRole('link', { name: 'Set budgets' })).toHaveAttribute('href', '/budgets')
  })

  it('ranks the top categories with their share, linking to spending by category for this month', async () => {
    dashboard()
    renderApp('/')

    const top = await card('Top categories')
    expect(within(top).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Housing₫4,000,00069%', 'Food & drink₫700,00012.1%'])
    expect(within(top).getByRole('link', { name: 'See spending by category' })).toHaveAttribute('href', '/reports/spending-by-category?period=thisMonth')
  })

  it('lists the latest transactions with their sign, linking to the transactions screen', async () => {
    dashboard()
    renderApp('/')

    const recent = await card('Recent transactions')
    const rows = within(recent).getAllByRole('listitem')
    expect(rows.map((row) => within(row).getByTestId('title').textContent)).toEqual(['Transfer in', 'Highlands', 'Clothes', 'Employer'])
    expect(rows.map((row) => within(row).getByTestId('amount').textContent)).toEqual(['₫500,000', '-₫45,000', '₫300,000', '₫20,000,000'])
    expect(rows[1]).toHaveTextContent('Nov 19, 2026')
    expect(rows[1]).toHaveTextContent('Everyday')
    expect(rows[2]).toHaveTextContent('Refund')
    expect(within(recent).getByRole('link', { name: 'See all transactions' })).toHaveAttribute('href', '/transactions')
  })

  it('lists what is coming up from recurring rules, saying which are reminders, linking to the recurring screen', async () => {
    dashboard()
    renderApp('/')

    const upcoming = await card('Coming up')
    const rows = within(upcoming).getAllByRole('listitem')
    expect(rows.map((row) => within(row).getByTestId('title').textContent)).toEqual(['Landlord', 'Salary'])
    expect(rows.map((row) => within(row).getByTestId('amount').textContent)).toEqual(['-₫9,000,000', '₫20,000,000'])
    expect(rows[0]).toHaveTextContent('Dec 1, 2026')
    expect(rows[0]).toHaveTextContent('Reminder')
    expect(rows[1]).toHaveTextContent('Recorded for you')
    expect(within(upcoming).getByRole('link', { name: 'See recurring rules' })).toHaveAttribute('href', '/recurring')
  })

  it('says when there are no transactions yet and nothing coming up', async () => {
    fakeDashboardApi({ hasAccounts: true })
    renderApp('/')

    expect(await card('Recent transactions')).toHaveTextContent('No transactions yet.')
    expect(await card('Coming up')).toHaveTextContent('Nothing is due in the next 30 days.')
    expect(await card('Top categories')).toHaveTextContent('Nothing spent this month yet.')
  })

  it('flags balances that are not converted beside the total balance', async () => {
    fakeDashboardApi({ hasAccounts: true, balance: { balance: '1000000.00', notConverted: [{ currency: 'USD', balance: '250.00' }] } })
    renderApp('/')

    expect(await card('Total balance')).toHaveTextContent('Not included: $250.00')
  })

  it('writes the savings rate, the shares and the amounts left out the way Vietnamese writes them', async () => {
    fakeProfileApi({ locale: 'vi' })
    fakeDashboardApi({
      hasAccounts: true,
      balance: { balance: '1000000.00', notConverted: [{ currency: 'USD', balance: '250.50' }, { currency: 'EUR', balance: '10.25' }] },
      thisMonth: { income: '3000000.00', expenses: '2000000.00', net: '1000000.00', savingsRate: 33.3, notConverted: 0 },
      topCategories: [{ category: category('c-food', 'Food & drink'), spent: '700000.00', share: 12.1, notConverted: 0 }],
    })
    renderApp('/', { language: 'vi' })

    expect(await screen.findByText('Tỷ lệ tiết kiệm 33,3%')).toBeInTheDocument()
    expect(await card('Danh mục chi nhiều nhất')).toHaveTextContent('12,1%')
    // Joined with "và", not a comma, which Vietnamese reads as a decimal comma.
    expect(await card('Tổng số dư')).toHaveTextContent('Chưa tính: 250,50 US$ và 10,25 €, vì chưa có tỷ giá.')
  })

  it('shows a skeleton for each card while it loads, laid out as the cards are', async () => {
    const api = fakeDashboardApi({ hasAccounts: true }, { held: true })
    renderApp('/')

    const loading = await screen.findByRole('status', { name: 'Loading the dashboard' })
    // Six cards, the latest transactions and what is coming up each across the whole width.
    expect([...loading.children].map((skeleton) => skeleton.classList.contains('md:col-span-2'))).toEqual([false, false, false, false, true, true])
    api.release()
    expect(await card('Total balance')).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Loading the dashboard' })).not.toBeInTheDocument()
  })

  it('guides a new user with no accounts to add one', async () => {
    fakeDashboardApi()
    renderApp('/')

    expect(await screen.findByRole('heading', { level: 2, name: 'Start by adding an account' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add an account' })).toHaveAttribute('href', '/accounts')
    expect(screen.queryByRole('region', { name: 'Total balance' })).not.toBeInTheDocument()
  })

  it('says when the dashboard cannot be loaded', async () => {
    const api = fakeDashboardApi()
    api.failWith = 500
    renderApp('/')

    expect(await screen.findByRole('alert')).toHaveTextContent('The dashboard could not be loaded.')
  })

  it('names itself in the browser tab', async () => {
    fakeDashboardApi()
    renderApp('/')

    await waitFor(() => expect(document.title).toBe('Dashboard · Personal Finance Manager'))
  })
})
