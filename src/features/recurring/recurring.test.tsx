import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { choose, offeredBy } from '@/test/combobox'
import { fakeAccountsApi } from '@/test/fakeAccountsApi'
import { defaultTestCategories, fakeCategoriesApi, type FakeCategory } from '@/test/fakeCategoriesApi'
import { fakeInstitutionsApi } from '@/test/fakeInstitutionsApi'
import { fakeRecurringRulesApi } from '@/test/fakeRecurringRulesApi'
import { fakeTransactionsApi } from '@/test/fakeTransactionsApi'
import { renderApp } from '@/test/renderApp'

const everyday = '01970000-0000-7000-8000-200000000000'
const dollars = '01970000-0000-7000-8000-200000000001'
const firstRule = '01970000-0000-7000-8000-500000000000'

/** Today in the test user's time zone. */
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

const twoAccounts: Parameters<typeof fakeAccountsApi>[0] = [{ name: 'Everyday' }, { name: 'Savings in dollars', currency: 'USD' }]

function fakeApis(
  rules: Parameters<typeof fakeRecurringRulesApi>[0] = [],
  accounts: Parameters<typeof fakeAccountsApi>[0] = twoAccounts,
  categories: FakeCategory[] = defaultTestCategories,
) {
  fakeInstitutionsApi()
  const accountsApi = fakeAccountsApi(accounts)
  const categoriesApi = fakeCategoriesApi({ categories })
  const rulesApi = fakeRecurringRulesApi(rules, { accounts: accountsApi.accounts, categories: categoriesApi.categories })
  return { accountsApi, categoriesApi, rulesApi }
}

const rent = { type: 'expense', accountId: everyday, amount: '9000000.00', categoryId: 'c-transport', payee: 'Landlord', startDate: '2026-12-05' } as const

/** Each listed rule: what it is headed by, the line under it, when it is next due, and its amount. */
function listed() {
  return within(screen.getByRole('list', { name: 'Recurring rules', hidden: true }))
    .getAllByRole('listitem', { hidden: true })
    .map((item) => [
      within(item).getByRole('heading', { hidden: true }).textContent,
      within(item).getByTestId('details').textContent,
      within(item).getByTestId('next').textContent,
      within(item).getByTestId('amount').textContent,
    ])
}

async function openNewRule(user: ReturnType<typeof renderApp>['user']) {
  await user.click(await screen.findByRole('button', { name: 'Add recurring rule' }))
  return within(screen.getByRole('dialog', { name: 'New recurring rule' }))
}

describe('the recurring screen', () => {
  it('lists the recurring rules, the last set up first, each with what it records, how often, when it is next due and its amount', async () => {
    fakeApis([
      rent,
      { type: 'income', accountId: dollars, amount: '2500.50', categoryId: 'c-salary', frequency: 'everyNDays', interval: 14, startDate: '2026-11-27', isPaused: true },
      { ...rent, payee: 'Gym', amount: '500000.00', frequency: 'yearly', startDate: '2025-01-31', endDate: '2026-01-31', nextRunDate: null },
      { ...rent, payee: 'Cleaner', amount: '300000.00', frequency: 'weekly', startDate: '2026-11-23', note: 'every Monday' },
    ])
    renderApp('/recurring')

    await screen.findByRole('list', { name: 'Recurring rules' })
    expect(listed()).toEqual([
      ['Cleaner', 'Transport · Everyday · Every week', 'Next on Nov 23, 2026', '-₫300,000'],
      ['Gym', 'Transport · Everyday · Every year', 'Ended on Jan 31, 2026', '-₫500,000'],
      ['Salary', 'Salary · Savings in dollars · Every 14 days', 'Paused', '$2,500.50'],
      ['Landlord', 'Transport · Everyday · Every month', 'Next on Dec 5, 2026', '-₫9,000,000'],
    ])
    expect(screen.getByText('every Monday')).toBeInTheDocument()
  })

  it('says so when there are no rules yet, and asks for an account first when there is none to record on', async () => {
    fakeApis()
    const first = renderApp('/recurring')
    expect(await screen.findByText('No recurring rules yet. Add one for your salary, rent or anything else that repeats.')).toBeInTheDocument()
    first.unmount()

    fakeApis([], [{ name: 'Closed', isArchived: true }])
    renderApp('/recurring')

    expect(await screen.findByText('A recurring rule records on an account, and you have none yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add an account' })).toHaveAttribute('href', '/accounts')
    expect(screen.queryByRole('button', { name: 'Add recurring rule' })).not.toBeInTheDocument()
  })

  it('sets up a recurring expense in a side drawer: account, amount, category, how often, from when, and optionally until when, payee and note', async () => {
    const { rulesApi } = fakeApis()
    const { user } = renderApp('/recurring')

    const drawer = await openNewRule(user)
    expect(drawer.getByRole('radio', { name: 'Expense' })).toBeChecked()
    expect(drawer.getByLabelText('Account')).toHaveDisplayValue('Everyday (VND)')
    expect(drawer.getByLabelText('How often')).toHaveDisplayValue('Every month')
    expect(drawer.getByLabelText('Starts on')).toHaveValue(today)
    expect(drawer.queryByLabelText('Days between')).not.toBeInTheDocument()
    await user.type(drawer.getByLabelText('Amount (VND)'), '9,000,000')
    await choose(user, drawer.getByLabelText('Category'), 'Transport')
    await user.clear(drawer.getByLabelText('Starts on'))
    await user.type(drawer.getByLabelText('Starts on'), '2027-01-31')
    await user.type(drawer.getByLabelText('Ends on (optional)'), '2027-12-31')
    await user.type(drawer.getByLabelText('Payee'), 'Landlord')
    await user.type(drawer.getByLabelText('Note'), 'flat')
    await user.click(drawer.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(rulesApi.requests).toEqual([
      {
        method: 'POST',
        path: '/api/v1/recurring-rules',
        body: {
          type: 'expense', accountId: everyday, amount: '9000000', categoryId: 'c-transport', frequency: 'monthly', interval: null,
          startDate: '2027-01-31', endDate: '2027-12-31', payee: 'Landlord', note: 'flat',
        },
      },
    ])
    expect(listed()).toEqual([['Landlord', 'Transport · Everyday · Every month', 'Next on Jan 31, 2027', '-₫9,000,000']])
  })

  it('closes the category picker on Escape before the drawer', async () => {
    fakeApis()
    const { user } = renderApp('/recurring')

    const drawer = await openNewRule(user)
    await user.type(drawer.getByLabelText('Category'), 'tra')
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'New recurring rule' })).toBeInTheDocument()
  })

  it('sets up recurring income every N days, in the currency of its account, offering only income categories', async () => {
    const { rulesApi } = fakeApis()
    const { user } = renderApp('/recurring')
    const drawer = await openNewRule(user)

    await user.click(drawer.getByRole('radio', { name: 'Income' }))
    expect(await offeredBy(user, drawer.getByLabelText('Category'))).toEqual(['Salary', 'Investments', 'Investments › Interest'])
    await user.selectOptions(drawer.getByLabelText('Account'), 'Savings in dollars (USD)')
    await user.type(drawer.getByLabelText('Amount (USD)'), '1,250.50')
    await choose(user, drawer.getByLabelText('Category'), 'Salary')
    await user.selectOptions(drawer.getByLabelText('How often'), 'Every N days')
    await user.type(drawer.getByLabelText('Days between'), '14')
    await user.click(drawer.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(rulesApi.requests[0]!.body).toMatchObject({ type: 'income', accountId: dollars, amount: '1250.50', frequency: 'everyNDays', interval: 14, endDate: null, payee: null })
    expect(listed()).toEqual([['Salary', `Salary · Savings in dollars · Every 14 days`, expect.stringContaining('Next on'), '$1,250.50']])
  })

  it('refuses what a rule cannot take before anything is sent, each under its own field', async () => {
    const { rulesApi } = fakeApis()
    const { user } = renderApp('/recurring')
    const drawer = await openNewRule(user)

    await user.selectOptions(drawer.getByLabelText('How often'), 'Every N days')
    await user.type(drawer.getByLabelText('Days between'), '400')
    await user.clear(drawer.getByLabelText('Starts on'))
    await user.type(drawer.getByLabelText('Starts on'), '2027-03-01')
    await user.type(drawer.getByLabelText('Ends on (optional)'), '2027-02-28')
    await user.click(drawer.getByRole('button', { name: 'Save' }))

    expect(await drawer.findByText('Enter an amount.')).toBeInTheDocument()
    expect(drawer.getByText('Choose a category.')).toBeInTheDocument()
    expect(drawer.getByText('Enter a whole number of days, from 1 to 365.')).toBeInTheDocument()
    expect(drawer.getByText('The end date cannot be before the start date.')).toBeInTheDocument()
    expect(rulesApi.requests).toEqual([])
  })

  it('says that a rule starting in the past records the occurrences since then', async () => {
    fakeApis()
    const { user } = renderApp('/recurring')
    const drawer = await openNewRule(user)
    const hint = 'Starts in the past: every occurrence since then is recorded, each on its own due date.'
    expect(drawer.queryByText(hint)).not.toBeInTheDocument()

    await user.clear(drawer.getByLabelText('Starts on'))
    await user.type(drawer.getByLabelText('Starts on'), '2020-01-01')

    expect(drawer.getByText(hint)).toBeInTheDocument()
  })

  it('edits a rule from what it says now', async () => {
    const { rulesApi } = fakeApis([{ ...rent, frequency: 'everyNDays', interval: 30, endDate: '2027-12-31', note: 'flat' }])
    const { user } = renderApp('/recurring')

    await user.click(await screen.findByRole('button', { name: 'Edit Landlord' }))
    const drawer = within(screen.getByRole('dialog', { name: 'Edit recurring rule' }))
    expect(drawer.getByLabelText('Amount (VND)')).toHaveValue('9,000,000')
    expect(drawer.getByLabelText('Category')).toHaveValue('Transport')
    expect(drawer.getByLabelText('How often')).toHaveDisplayValue('Every N days')
    expect(drawer.getByLabelText('Days between')).toHaveValue('30')
    expect(drawer.getByLabelText('Starts on')).toHaveValue('2026-12-05')
    expect(drawer.getByLabelText('Ends on (optional)')).toHaveValue('2027-12-31')
    await user.clear(drawer.getByLabelText('Amount (VND)'))
    await user.type(drawer.getByLabelText('Amount (VND)'), '9,500,000')
    await user.selectOptions(drawer.getByLabelText('How often'), 'Every month')
    await user.clear(drawer.getByLabelText('Ends on (optional)'))
    await user.click(drawer.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(rulesApi.requests).toEqual([
      {
        method: 'PUT',
        path: `/api/v1/recurring-rules/${firstRule}`,
        body: {
          type: 'expense', accountId: everyday, amount: '9500000', categoryId: 'c-transport', frequency: 'monthly', interval: null,
          startDate: '2026-12-05', endDate: null, payee: 'Landlord', note: 'flat',
        },
      },
    ])
    expect(listed()).toEqual([['Landlord', 'Transport · Everyday · Every month', 'Next on Dec 5, 2026', '-₫9,500,000']])
  })

  it('pauses a rule, which then says so and can be resumed', async () => {
    const { rulesApi } = fakeApis([rent])
    const { user } = renderApp('/recurring')

    await user.click(await screen.findByRole('button', { name: 'Pause Landlord' }))

    expect(await screen.findByRole('button', { name: 'Resume Landlord' })).toBeInTheDocument()
    expect(listed()[0]![2]).toBe('Paused')
    await user.click(screen.getByRole('button', { name: 'Resume Landlord' }))

    expect(await screen.findByRole('button', { name: 'Pause Landlord' })).toBeInTheDocument()
    expect(listed()[0]![2]).toBe('Next on Dec 5, 2026')
    expect(rulesApi.requests).toEqual([
      { method: 'POST', path: `/api/v1/recurring-rules/${firstRule}/pause` },
      { method: 'POST', path: `/api/v1/recurring-rules/${firstRule}/resume` },
    ])
  })

  it('deletes a rule once the user confirms, saying what happens to the transactions it recorded', async () => {
    const { rulesApi } = fakeApis([rent, { ...rent, payee: 'Gym' }])
    const { user } = renderApp('/recurring')

    await user.click(await screen.findByRole('button', { name: 'Delete Gym' }))
    const confirmation = within(screen.getByRole('group', { name: 'Delete Gym' }))
    expect(confirmation.getByText('Delete Gym? It records nothing more. The transactions it already recorded stay.')).toBeInTheDocument()
    expect(rulesApi.rules).toHaveLength(2)
    await user.click(confirmation.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(listed().map(([title]) => title)).toEqual(['Landlord']))
    expect(rulesApi.rules).toHaveLength(1)
  })

  it('shows under its field what the API refuses, and keeps what was entered', async () => {
    const { accountsApi, rulesApi } = fakeApis()
    const { user } = renderApp('/recurring')
    const drawer = await openNewRule(user)
    await user.type(drawer.getByLabelText('Amount (VND)'), '100')
    await choose(user, drawer.getByLabelText('Category'), 'Transport')
    // Archived somewhere else since the screen loaded.
    accountsApi.accounts[0]!.isArchived = true
    await user.click(drawer.getByRole('button', { name: 'Save' }))

    expect(await drawer.findByText('Choose one of your accounts that is not archived.')).toBeInTheDocument()
    expect(drawer.getByLabelText('Amount (VND)')).toHaveValue('100')
    expect(rulesApi.rules).toHaveLength(0)
  })

  it('says so in a toast when a change fails, and makes it again on Try again', async () => {
    const { rulesApi } = fakeApis([rent])
    const { user } = renderApp('/recurring')
    rulesApi.failNext()

    await user.click(await screen.findByRole('button', { name: 'Pause Landlord' }))
    expect(await screen.findByText('The recurring rule was not changed.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('button', { name: 'Resume Landlord' })).toBeInTheDocument()
    expect(screen.queryByText('The recurring rule was not changed.')).not.toBeInTheDocument()

    rulesApi.failNext()
    await user.click(screen.getByRole('button', { name: 'Edit Landlord' }))
    const drawer = within(screen.getByRole('dialog', { name: 'Edit recurring rule' }))
    await user.click(drawer.getByRole('button', { name: 'Save' }))
    expect(await drawer.findByText('The recurring rule was not saved.')).toBeInTheDocument()
    await user.click(drawer.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('a transaction a recurring rule posted', () => {
  it('links back to its rule, which the recurring screen then points out', async () => {
    const { accountsApi, categoriesApi } = fakeApis([{ ...rent, payee: 'Gym' }, rent])
    fakeTransactionsApi(
      [
        { accountId: everyday, amount: '9000000.00', date: '2026-11-05', categoryId: 'c-transport', payee: 'Landlord', recurringRuleId: '01970000-0000-7000-8000-500000000001' },
        { accountId: everyday, amount: '45000.00', date: '2026-11-04', categoryId: 'c-transport', payee: 'Taxi' },
      ],
      { accounts: accountsApi.accounts, categories: categoriesApi.categories },
    )
    const { user } = renderApp('/transactions')

    const transactions = within(await screen.findByRole('list', { name: 'Transactions' })).getAllByRole('listitem')
    expect(within(transactions[1]!).queryByRole('link')).not.toBeInTheDocument()
    await user.click(within(transactions[0]!).getByRole('link', { name: 'Recorded by a recurring rule' }))

    const rules = within(await screen.findByRole('list', { name: 'Recurring rules' })).getAllByRole('listitem')
    expect(rules.map((rule) => [within(rule).getByRole('heading').textContent, rule.getAttribute('aria-current')])).toEqual([
      ['Landlord', 'true'],
      ['Gym', null],
    ])
  })
})
