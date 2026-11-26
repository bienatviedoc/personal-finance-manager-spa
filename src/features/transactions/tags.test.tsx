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

  it('are at most 50 characters each: a longer one says so and nothing is sent', async () => {
    const transactionsApi = fakeApis()
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('button', { name: 'Add transaction' }))
    const drawer = within(screen.getByRole('dialog', { name: 'New transaction' }))
    await user.type(drawer.getByLabelText('Amount (VND)'), '300,000')
    await choose(user, drawer.getByLabelText('Category'), 'Transport')
    await user.type(drawer.getByLabelText('Tags'), `${'t'.repeat(51)}{Enter}`)
    await user.click(drawer.getByRole('button', { name: 'Save' }))

    expect(await drawer.findByText('Use at most 20 tags, each of at most 50 characters.')).toBeInTheDocument()
    expect(transactionsApi.requests).toEqual([])
  })

  it('filter the list, and the filter lives in the address', async () => {
    const transactionsApi = fakeApis([
      { accountId: everyday, amount: '50000.00', date: '2026-11-02', payee: 'Flowers', tags: ['gifts', 'tet-2027'] },
      { accountId: everyday, amount: '900000.00', date: '2026-11-03', payee: 'Vietnam Airlines', tags: ['japan-trip'] },
      { accountId: everyday, amount: '30000.00', date: '2026-11-04', payee: 'Phở Thìn' },
    ])
    const { user, router } = renderApp('/transactions')

    await screen.findByRole('list', { name: 'Transactions' })
    const filters = within(screen.getByRole('search', { name: 'Filter transactions' }))
    expect(within(filters.getByLabelText('Tag')).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'All tags',
      'gifts',
      'japan-trip',
      'tet-2027',
    ])
    await user.selectOptions(filters.getByLabelText('Tag'), 'tet-2027')

    await waitFor(() => expect(listed()).toEqual([['Flowers', ['gifts', 'tet-2027']]]))
    expect(router.state.location.search).toBe('?tag=tet-2027')
    expect(transactionsApi.listQueries.at(-1)).toEqual(expect.objectContaining({ tag: 'tet-2027' }))

    await user.click(filters.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(listed()).toHaveLength(3))
    expect(router.state.location.search).toBe('')
  })

  it('filter the list from an address opened again, in any case', async () => {
    fakeApis([
      { accountId: everyday, amount: '50000.00', date: '2026-11-02', payee: 'Flowers', tags: ['gifts', 'tet-2027'] },
      { accountId: everyday, amount: '900000.00', date: '2026-11-03', payee: 'Vietnam Airlines', tags: ['japan-trip'] },
    ])
    renderApp('/transactions?tag=Japan-Trip')

    await waitFor(() => expect(listed()).toEqual([['Vietnam Airlines', ['japan-trip']]]))
    expect(screen.getByLabelText('Tag')).toHaveValue('japan-trip')
  })

  it('are written in Vietnamese for a user who reads Vietnamese', async () => {
    fakeApis([{ accountId: everyday, amount: '50000.00', payee: 'Flowers', tags: ['gifts'] }])
    const { user } = renderApp('/transactions', { language: 'vi' })

    const row = within(await screen.findByRole('list', { name: 'Giao dịch' })).getByRole('list', { name: 'Nhãn của Flowers' })
    expect(within(row).getByText('gifts')).toBeInTheDocument()
    expect(screen.getByLabelText('Nhãn')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sửa Flowers' }))
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Bỏ nhãn gifts' })).toBeInTheDocument()
  })
})
