import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { choose } from '@/test/combobox'
import { fakeAccountsApi } from '@/test/fakeAccountsApi'
import { defaultTestCategories, fakeCategoriesApi } from '@/test/fakeCategoriesApi'
import { fakeInstitutionsApi } from '@/test/fakeInstitutionsApi'
import { fakeTransactionsApi } from '@/test/fakeTransactionsApi'
import { renderApp } from '@/test/renderApp'

const everyday = '01970000-0000-7000-8000-200000000000'

/** Today in the test user's time zone, which is as late as a transaction can be dated. */
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

function fakeApis(transactions: Parameters<typeof fakeTransactionsApi>[0] = [], balance = '1000000.00') {
  fakeInstitutionsApi()
  const accountsApi = fakeAccountsApi([{ name: 'Everyday', openingBalance: '1000000.00', balance }])
  const categoriesApi = fakeCategoriesApi({ categories: defaultTestCategories })
  const transactionsApi = fakeTransactionsApi(transactions, { accounts: accountsApi.accounts, categories: categoriesApi.categories, today })
  return { accountsApi, transactionsApi }
}

/** Each listed transaction: what it is headed by, whether it is marked as a refund, and its amount. */
function listed() {
  return within(screen.getByRole('list', { name: 'Transactions', hidden: true }))
    .getAllByRole('listitem', { hidden: true })
    .map((item) => [
      within(item).getByRole('heading', { hidden: true }).textContent,
      within(item).queryByText('Refund') !== null,
      within(item).getByTestId('amount').textContent,
    ])
}

describe('refunds', () => {
  it('are marked in the list, with an amount that comes back instead of going out', async () => {
    fakeApis([
      { accountId: everyday, amount: '800000.00', date: '2026-11-02', categoryId: 'c-transport', payee: 'Bike shop' },
      { accountId: everyday, amount: '300000.00', date: '2026-11-09', categoryId: 'c-transport', payee: 'Bike shop', isRefund: true },
    ])
    renderApp('/transactions')

    await screen.findByRole('list', { name: 'Transactions' })
    expect(listed()).toEqual([
      ['Bike shop', true, '+₫300,000'],
      ['Bike shop', false, '-₫800,000'],
    ])
  })

  it('are recorded as an expense flagged as a refund, which raises the balance of its account', async () => {
    const { accountsApi, transactionsApi } = fakeApis()
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('button', { name: 'Add transaction' }))
    const drawer = within(screen.getByRole('dialog', { name: 'New transaction' }))
    expect(drawer.getByRole('checkbox', { name: 'This is a refund' })).not.toBeChecked()
    await user.click(drawer.getByRole('checkbox', { name: 'This is a refund' }))
    await user.type(drawer.getByLabelText('Amount (VND)'), '300,000')
    await choose(user, drawer.getByLabelText('Category'), 'Transport')
    await user.type(drawer.getByLabelText('Payee'), 'Bike shop')
    const answer = transactionsApi.hold()
    await user.click(drawer.getByRole('button', { name: 'Save' }))

    // Marked as soon as it is sent, before the API has answered.
    await waitFor(() => expect(listed()).toEqual([['Bike shop', true, '+₫300,000']]))
    answer()
    await waitFor(() => expect(transactionsApi.transactions).toHaveLength(1))
    expect(transactionsApi.requests[0]?.body).toEqual(expect.objectContaining({ type: 'expense', isRefund: true, amount: '300000' }))
    expect(accountsApi.accounts[0]?.balance).toBe('1300000.00')
    // The form is ready for the next transaction, which is not a refund unless it says so.
    await drawer.findByText('Saved. Add another, or close when you are done.')
    expect(drawer.getByRole('checkbox', { name: 'This is a refund' })).not.toBeChecked()
    expect(listed()).toEqual([['Bike shop', true, '+₫300,000']])
  })

  it('are only ever an expense: income is not offered the flag, and a flagged expense turned into income lets go of it', async () => {
    const { transactionsApi } = fakeApis()
    const { user } = renderApp('/transactions')
    await user.click(await screen.findByRole('button', { name: 'Add transaction' }))
    const drawer = within(screen.getByRole('dialog', { name: 'New transaction' }))

    await user.click(drawer.getByRole('checkbox', { name: 'This is a refund' }))
    await user.click(drawer.getByRole('radio', { name: 'Income' }))
    expect(drawer.queryByRole('checkbox', { name: 'This is a refund' })).not.toBeInTheDocument()
    await user.click(drawer.getByRole('radio', { name: 'Expense' }))
    expect(drawer.getByRole('checkbox', { name: 'This is a refund' })).not.toBeChecked()

    await user.click(drawer.getByRole('checkbox', { name: 'This is a refund' }))
    await user.click(drawer.getByRole('radio', { name: 'Income' }))
    await user.type(drawer.getByLabelText('Amount (VND)'), '500')
    await choose(user, drawer.getByLabelText('Category'), 'Salary')
    await user.click(drawer.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(transactionsApi.transactions).toHaveLength(1))
    expect(transactionsApi.transactions[0]).toEqual(expect.objectContaining({ type: 'income', isRefund: false }))
    expect(listed()).toEqual([['Salary', false, '₫500']])
  })

  it('can be turned back into a plain expense, and an expense into a refund, by editing', async () => {
    const { accountsApi, transactionsApi } = fakeApis(
      [{ accountId: everyday, amount: '300000.00', date: '2026-11-09', categoryId: 'c-transport', payee: 'Bike shop', isRefund: true }],
      '1300000.00',
    )
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('button', { name: 'Edit Bike shop' }))
    const drawer = within(screen.getByRole('dialog', { name: 'Edit transaction' }))
    expect(drawer.getByRole('checkbox', { name: 'This is a refund' })).toBeChecked()
    await user.click(drawer.getByRole('checkbox', { name: 'This is a refund' }))
    await user.click(drawer.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(transactionsApi.transactions[0]).toEqual(expect.objectContaining({ isRefund: false }))
    expect(listed()).toEqual([['Bike shop', false, '-₫300,000']])
    expect(accountsApi.accounts[0]?.balance).toBe('700000.00')

    await user.click(await screen.findByRole('button', { name: 'Edit Bike shop' }))
    const again = within(screen.getByRole('dialog', { name: 'Edit transaction' }))
    await user.click(again.getByRole('checkbox', { name: 'This is a refund' }))
    await user.click(again.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(listed()).toEqual([['Bike shop', true, '+₫300,000']])
    expect(accountsApi.accounts[0]?.balance).toBe('1300000.00')
  })

  it('are written in Vietnamese for a user who reads Vietnamese', async () => {
    fakeApis([{ accountId: everyday, amount: '300000.00', date: '2026-11-09', categoryId: 'c-transport', payee: 'Bike shop', isRefund: true }])
    const { user } = renderApp('/transactions', { language: 'vi' })

    const row = within(await screen.findByRole('list', { name: 'Giao dịch' })).getByRole('listitem')
    expect(within(row).getByText('Hoàn tiền')).toBeInTheDocument()
    expect(within(row).getByTestId('amount').textContent).toBe('+300.000\u00a0₫')
    await user.click(screen.getByRole('button', { name: 'Thêm giao dịch' }))
    expect(within(screen.getByRole('dialog', { name: 'Giao dịch mới' })).getByRole('checkbox', { name: 'Đây là khoản hoàn tiền' })).toBeInTheDocument()
  })
})
