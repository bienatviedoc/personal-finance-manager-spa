import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeAccountsApi } from '@/test/fakeAccountsApi'
import { defaultTestCategories, fakeCategoriesApi } from '@/test/fakeCategoriesApi'
import { fakeInstitutionsApi } from '@/test/fakeInstitutionsApi'
import { fakeTransactionsApi } from '@/test/fakeTransactionsApi'
import { renderApp } from '@/test/renderApp'

const everyday = '01970000-0000-7000-8000-200000000000'
const savings = '01970000-0000-7000-8000-200000000001'

function fakeApis(transactions: Parameters<typeof fakeTransactionsApi>[0] = []) {
  fakeInstitutionsApi()
  const accountsApi = fakeAccountsApi([
    { name: 'Everyday', openingBalance: '1000000.00' },
    { name: 'Savings', openingBalance: '0.00' },
  ])
  const categoriesApi = fakeCategoriesApi({ categories: defaultTestCategories })
  const transactionsApi = fakeTransactionsApi(transactions, { accounts: accountsApi.accounts, categories: categoriesApi.categories })
  return { accountsApi, transactionsApi }
}

/** Each recently deleted transaction: what it is headed by and the line under it. */
function recentlyDeleted() {
  return within(screen.getByRole('list', { name: 'Recently deleted' }))
    .getAllByRole('listitem')
    .map((item) => [within(item).getByRole('heading').textContent, within(item).getByTestId('details').textContent])
}

/** A date 30 days from now, in the test user's time zone, as the screen writes it. */
const in30Days = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))

describe('recently deleted transactions', () => {
  it('are listed once deleted, with when each can be restored until, and restoring one returns it to the list and its account balance', async () => {
    const { accountsApi } = fakeApis([{ accountId: everyday, payee: 'Co.opmart', amount: '125000.00', date: '2026-11-02', categoryId: 'c-groceries' }])
    accountsApi.accounts[0]!.balance = '875000.00'
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('button', { name: 'Delete Co.opmart' }))
    await user.click(within(screen.getByRole('group', { name: 'Delete Co.opmart' })).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(accountsApi.accounts[0]!.balance).toBe('1000000.00'))

    await user.click(screen.getByRole('link', { name: 'Recently deleted' }))
    await screen.findByRole('list', { name: 'Recently deleted' })
    expect(recentlyDeleted()).toEqual([['Co.opmart', `Groceries · Everyday · Nov 2, 2026 · -₫125,000 · Can be restored until ${in30Days}`]])

    await user.click(screen.getByRole('button', { name: 'Restore Co.opmart' }))
    expect(await screen.findByText('Nothing was deleted in the last 30 days.')).toBeInTheDocument()
    expect(accountsApi.accounts[0]!.balance).toBe('875000.00')

    await user.click(screen.getByRole('link', { name: 'Back to transactions' }))
    expect(await screen.findByRole('heading', { name: 'Co.opmart' })).toBeInTheDocument()
  })

  it('restore a whole transfer when one of its legs is restored', async () => {
    const { transactionsApi } = fakeApis([
      { type: 'transferOut', accountId: everyday, amount: '200000.00', date: '2026-11-02', transferId: 't-1' },
      { type: 'transferIn', accountId: savings, amount: '200000.00', date: '2026-11-02', transferId: 't-1' },
    ])
    const { user } = renderApp('/transactions')

    await user.click((await screen.findAllByRole('button', { name: 'Delete Transfer out' }))[0]!)
    await user.click(within(screen.getByRole('group', { name: 'Delete Transfer out' })).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(transactionsApi.deleted).toHaveLength(2))

    await user.click(screen.getByRole('link', { name: 'Recently deleted' }))
    await screen.findByRole('list', { name: 'Recently deleted' })
    expect(recentlyDeleted().map(([title]) => title)).toEqual(['Transfer in', 'Transfer out'])
    expect(screen.getAllByText('Restoring it restores the whole transfer.')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Restore Transfer in' }))
    expect(await screen.findByText('Nothing was deleted in the last 30 days.')).toBeInTheDocument()
    expect(transactionsApi.transactions.map((transaction) => transaction.type).toSorted()).toEqual(['transferIn', 'transferOut'])
  })

  it('say in a toast when restoring fails, and restore when the user tries again', async () => {
    const { transactionsApi } = fakeApis([{ payee: 'Grab', amount: '45000.00' }])
    transactionsApi.deleted.push({ ...transactionsApi.transactions.pop()!, deletedAt: new Date().toISOString() })
    const { user } = renderApp('/transactions/deleted')

    transactionsApi.failNext()
    await user.click(await screen.findByRole('button', { name: 'Restore Grab' }))
    expect(await screen.findByText('The transaction was not restored.')).toBeInTheDocument()
    expect(transactionsApi.transactions).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(transactionsApi.transactions).toHaveLength(1))
    expect(await screen.findByText('Nothing was deleted in the last 30 days.')).toBeInTheDocument()
  })
})
