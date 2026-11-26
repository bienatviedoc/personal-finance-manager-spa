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

function fakeApis(transactions: Parameters<typeof fakeTransactionsApi>[0] = []) {
  fakeInstitutionsApi()
  const accountsApi = fakeAccountsApi([{ name: 'Everyday', openingBalance: '1000000.00' }])
  const categoriesApi = fakeCategoriesApi({ categories: defaultTestCategories })
  return fakeTransactionsApi(transactions, { accounts: accountsApi.accounts, categories: categoriesApi.categories, today })
}

/** Each listed transaction: what it is headed by, and its tags. */
function listed() {
  return within(screen.getByRole('list', { name: 'Transactions', hidden: true }))
    .getAllByRole('listitem', { hidden: true })
    // A transaction's own row, not one of its tags.
    .filter((item) => within(item).queryByRole('heading', { hidden: true }) !== null)
    .map((item) => [
      within(item).getByRole('heading', { hidden: true }).textContent,
      within(item)
        .queryAllByTestId('tag')
        .map((tag) => tag.textContent),
    ])
}

describe('tags', () => {
  it('are added on the form, suggested from the tags the user has, and shown on the transaction in the list', async () => {
    const transactionsApi = fakeApis([{ accountId: everyday, amount: '50000.00', payee: 'Flowers', tags: ['gifts', 'tet-2027'] }])
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('button', { name: 'Add transaction' }))
    const drawer = within(screen.getByRole('dialog', { name: 'New transaction' }))
    await user.type(drawer.getByLabelText('Amount (VND)'), '300,000')
    await choose(user, drawer.getByLabelText('Category'), 'Transport')
    await user.type(drawer.getByLabelText('Payee'), 'Vietnam Airlines')
    await user.type(drawer.getByLabelText('Tags'), 'te')
    await user.click(await drawer.findByRole('option', { name: 'tet-2027' }))
    await user.type(drawer.getByLabelText('Tags'), 'Japan-Trip{Enter}')
    expect(drawer.getAllByTestId('tag').map((tag) => tag.textContent)).toEqual(['tet-2027', 'japan-trip'])
    await user.click(drawer.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(transactionsApi.transactions).toHaveLength(2))
    expect(transactionsApi.requests[0]?.body).toEqual(expect.objectContaining({ tags: ['japan-trip', 'tet-2027'] }))
    await waitFor(() =>
      expect(listed()).toEqual([
        ['Vietnam Airlines', ['japan-trip', 'tet-2027']],
        ['Flowers', ['gifts', 'tet-2027']],
      ]),
    )
    // The form is ready for the next transaction, with no tags.
    expect(drawer.queryAllByTestId('tag')).toEqual([])
  })

  it('are removed on the form when editing, and one typed in any case is the tag the user has', async () => {
    const transactionsApi = fakeApis([{ accountId: everyday, amount: '50000.00', payee: 'Flowers', tags: ['gifts', 'tet-2027'] }])
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('button', { name: 'Edit Flowers' }))
    const drawer = within(screen.getByRole('dialog', { name: 'Edit transaction' }))
    expect(drawer.getAllByTestId('tag').map((tag) => tag.textContent)).toEqual(['gifts', 'tet-2027'])
    await user.click(drawer.getByRole('button', { name: 'Remove tag gifts' }))
    // Typed and left without Enter: moving on to Save keeps it.
    await user.type(drawer.getByLabelText('Tags'), ' TET-2027 ')
    await user.click(drawer.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(transactionsApi.requests[0]?.body).toEqual(expect.objectContaining({ tags: ['tet-2027'] }))
    expect(listed()).toEqual([['Flowers', ['tet-2027']]])

    await user.click(screen.getByRole('button', { name: 'Edit Flowers' }))
    const again = within(screen.getByRole('dialog', { name: 'Edit transaction' }))
    await user.click(again.getByLabelText('Tags'))
    await user.keyboard('{Backspace}')
    await user.click(again.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(transactionsApi.transactions[0]?.tags).toEqual([])
    expect(listed()).toEqual([['Flowers', []]])
    // A tag stays the user's once no transaction has it.
    expect(transactionsApi.tags).toEqual(['gifts', 'tet-2027'])
  })
})
