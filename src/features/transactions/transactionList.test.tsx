import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeAccountsApi } from '@/test/fakeAccountsApi'
import { fakeCategoriesApi } from '@/test/fakeCategoriesApi'
import { fakeInstitutionsApi } from '@/test/fakeInstitutionsApi'
import { fakeTransactionsApi } from '@/test/fakeTransactionsApi'
import { renderApp } from '@/test/renderApp'

const everyday = '01970000-0000-7000-8000-200000000000'
const dollars = '01970000-0000-7000-8000-200000000001'

type Seeded = Parameters<typeof fakeTransactionsApi>[0]

const household: Seeded = [
  { type: 'expense', accountId: everyday, amount: '125000.00', date: '2026-11-02', categoryId: 'c-groceries', payee: 'Co.opmart', note: 'weekly shop' },
  { type: 'income', accountId: dollars, amount: '2500.50', date: '2026-11-05', categoryId: 'c-salary', payee: 'Acme' },
  { type: 'expense', accountId: everyday, amount: '45000.00', date: '2026-10-28', categoryId: 'c-transport', payee: 'Grab', note: 'ride to the co.opmart' },
  { type: 'expense', accountId: everyday, amount: '90000.00', date: '2026-11-10', categoryId: 'c-food', payee: 'Phở Thìn' },
  { type: 'income', accountId: everyday, amount: '15000000.00', date: '2026-11-01', categoryId: 'c-salary', payee: 'Viettel' },
  { type: 'expense', accountId: dollars, amount: '39.50', date: '2026-11-03', categoryId: 'c-eating-out', payee: 'Pizza 4P’s' },
]

function fakeApis(transactions: Seeded = household) {
  fakeInstitutionsApi()
  const accountsApi = fakeAccountsApi([
    { name: 'Everyday', openingBalance: '1000000.00' },
    { name: 'Savings in dollars', currency: 'USD', openingBalance: '100.00' },
  ])
  const categoriesApi = fakeCategoriesApi()
  return fakeTransactionsApi(transactions, { accounts: accountsApi.accounts, categories: categoriesApi.categories })
}

/** Who each listed transaction was paid to or by, in the order the list shows them. */
function payees() {
  const list = screen.getByRole('list', { name: 'Transactions' })
  return within(list)
    .getAllByRole('listitem')
    // Its own rows, not the lines listed inside a split.
    .filter((item) => item.parentElement === list)
    .map((item) => within(item).getByRole('heading').textContent)
}

/** The list, once it has loaded. The first test of the file also waits for the app to be read in, so it is given time. */
const listShown = () => screen.findByRole('list', { name: 'Transactions' }, { timeout: 5000 })

const filterBar = () => within(screen.getByRole('search', { name: 'Filter transactions' }))

/** What the screen says the filtered transactions come to. */
const total = () => screen.getByRole('region', { name: 'Total of these transactions' }).textContent

describe('the transaction list', () => {
  it('is narrowed to an account, a category with its subcategories or a type, and the address follows', async () => {
    fakeApis()
    const { user, router } = renderApp('/transactions')
    await listShown()
    expect(payees()).toEqual(['Phở Thìn', 'Acme', 'Pizza 4P’s', 'Co.opmart', 'Viettel', 'Grab'])

    await user.selectOptions(filterBar().getByLabelText('Account'), 'Savings in dollars')
    await waitFor(() => expect(payees()).toEqual(['Acme', 'Pizza 4P’s']))
    expect(router.state.location.search).toBe(`?accountId=${dollars}`)

    await user.selectOptions(filterBar().getByLabelText('Account'), 'All accounts')
    await user.selectOptions(filterBar().getByLabelText('Category'), filterBar().getByRole('option', { name: 'Food & drink' }))
    await waitFor(() => expect(payees()).toEqual(['Phở Thìn', 'Pizza 4P’s', 'Co.opmart']))
    expect(router.state.location.search).toBe('?categoryId=c-food')

    await user.selectOptions(filterBar().getByLabelText('Category'), 'All categories')
    await user.selectOptions(filterBar().getByLabelText('Type'), 'Income')
    await waitFor(() => expect(payees()).toEqual(['Acme', 'Viettel']))
    expect(router.state.location.search).toBe('?type=income')
  })

  it('is narrowed to a range of dates that includes both of its ends', async () => {
    fakeApis()
    const { user, router } = renderApp('/transactions?type=income')
    await listShown()

    await user.type(filterBar().getByLabelText('From'), '2026-11-02')
    await user.type(filterBar().getByLabelText('To'), '2026-11-05')
    await waitFor(() => expect(payees()).toEqual(['Acme']))
    await user.clear(filterBar().getByLabelText('From'))
    await user.type(filterBar().getByLabelText('From'), '2026-11-01')
    await waitFor(() => expect(payees()).toEqual(['Acme', 'Viettel']))
    await user.clear(filterBar().getByLabelText('From'))
    await user.type(filterBar().getByLabelText('From'), '2026-11-02')
    await waitFor(() => expect(payees()).toEqual(['Acme']))
    expect(router.state.location.search).toBe('?type=income&to=2026-11-05&from=2026-11-02')
  })

  it('opened at an address with filters and a sort order shows that view, with the filter bar saying so', async () => {
    fakeApis()
    renderApp(`/transactions?accountId=${everyday}&type=expense&from=2026-11-01&q=h&min=90000&sort=amount&order=asc`)

    await listShown()
    expect(payees()).toEqual(['Phở Thìn', 'Co.opmart'])
    expect(filterBar().getByLabelText('Account')).toHaveDisplayValue('Everyday')
    expect(filterBar().getByLabelText('Type')).toHaveDisplayValue('Expense')
    expect(filterBar().getByLabelText('From')).toHaveValue('2026-11-01')
    expect(filterBar().getByLabelText('To')).toHaveValue('')
    expect(filterBar().getByLabelText('Search payee and note')).toHaveValue('h')
    expect(filterBar().getByLabelText('Minimum amount')).toHaveValue('90,000')
    expect(filterBar().getByLabelText('Sort by')).toHaveDisplayValue('Smallest amount first')
  })

  it('leaves out of the view whatever in the address is not a filter it can read', async () => {
    const api = fakeApis()
    renderApp('/transactions?type=transfer&from=yesterday&min=lots&sort=payee&order=up&accountId=')

    await listShown()
    expect(payees()).toHaveLength(6)
    expect(api.listQueries).toEqual([{}])
  })

  it('searches the payee and the note once the typing pauses', async () => {
    const api = fakeApis()
    const { user, router } = renderApp('/transactions')
    await listShown()

    await user.type(filterBar().getByLabelText('Search payee and note'), 'OPMART')

    await waitFor(() => expect(payees()).toEqual(['Co.opmart', 'Grab']))
    expect(router.state.location.search).toBe('?q=OPMART')
    // One request for the whole word, not one for each letter.
    expect(api.listQueries).toEqual([{}, { q: 'OPMART' }])
  })

  it('is narrowed to a range of amounts, typed with the separators of the interface language', async () => {
    fakeApis()
    const { user, router } = renderApp('/transactions')
    await listShown()

    await user.type(filterBar().getByLabelText('Minimum amount'), '39.5')
    await user.type(filterBar().getByLabelText('Maximum amount'), '90,000')

    await waitFor(() => expect(payees()).toEqual(['Phở Thìn', 'Acme', 'Pizza 4P’s', 'Grab']))
    expect(router.state.location.search).toBe('?min=39.5&max=90000')

    await user.clear(filterBar().getByLabelText('Maximum amount'))
    await user.type(filterBar().getByLabelText('Maximum amount'), '9o')

    expect(await filterBar().findByText('Enter an amount, such as 1,250,000.')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.search).toBe('?min=39.5'))
  })

  it('is sorted by date or by amount, either way round', async () => {
    fakeApis()
    const { user, router } = renderApp(`/transactions?accountId=${everyday}`)
    await listShown()
    expect(filterBar().getByLabelText('Sort by')).toHaveDisplayValue('Newest first')
    expect(payees()).toEqual(['Phở Thìn', 'Co.opmart', 'Viettel', 'Grab'])

    await user.selectOptions(filterBar().getByLabelText('Sort by'), 'Oldest first')
    await waitFor(() => expect(payees()).toEqual(['Grab', 'Viettel', 'Co.opmart', 'Phở Thìn']))
    expect(router.state.location.search).toBe(`?accountId=${everyday}&order=asc`)

    await user.selectOptions(filterBar().getByLabelText('Sort by'), 'Largest amount first')
    await waitFor(() => expect(payees()).toEqual(['Viettel', 'Co.opmart', 'Phở Thìn', 'Grab']))
    expect(router.state.location.search).toBe(`?accountId=${everyday}&sort=amount`)

    await user.selectOptions(filterBar().getByLabelText('Sort by'), 'Smallest amount first')
    await waitFor(() => expect(payees()).toEqual(['Grab', 'Phở Thìn', 'Co.opmart', 'Viettel']))

    await user.selectOptions(filterBar().getByLabelText('Sort by'), 'Newest first')
    await waitFor(() => expect(router.state.location.search).toBe(`?accountId=${everyday}`))
  })

  it('shows what everything filtered comes to in each currency, as the API added it up', async () => {
    fakeApis()
    const { user } = renderApp('/transactions')
    await listShown()

    expect(total()).toBe('6 transactions' + 'VND' + 'Income₫15,000,000' + 'Expenses₫260,000' + 'Net₫14,740,000' + 'USD' + 'Income$2,500.50' + 'Expenses$39.50' + 'Net$2,461.00')

    await user.selectOptions(filterBar().getByLabelText('Type'), 'Expense')
    await waitFor(() => expect(total()).toBe('4 transactions' + 'VND' + 'Income₫0' + 'Expenses₫260,000' + 'Net-₫260,000' + 'USD' + 'Income$0.00' + 'Expenses$39.50' + 'Net-$39.50'))

    await user.selectOptions(filterBar().getByLabelText('Account'), 'Savings in dollars')
    await waitFor(() => expect(total()).toBe('1 transaction' + 'USD' + 'Income$0.00' + 'Expenses$39.50' + 'Net-$39.50'))
  })

  it('finds a split by the category of any of its lines, and takes a refund off the expenses in the total', async () => {
    fakeApis([
      {
        accountId: everyday,
        amount: '500000.00',
        payee: 'Aeon',
        lines: [
          { categoryId: 'c-groceries', amount: '320000.00', note: null },
          { categoryId: 'c-transport', amount: '180000.00', note: null },
        ],
      },
      { accountId: everyday, amount: '90000.00', payee: 'Grab', categoryId: 'c-transport' },
      { accountId: everyday, amount: '40000.00', payee: 'Grab refund', categoryId: 'c-transport', isRefund: true },
      { accountId: everyday, amount: '70000.00', payee: 'Phở Thìn', categoryId: 'c-eating-out' },
    ])
    const { user } = renderApp('/transactions')
    await listShown()

    await user.selectOptions(filterBar().getByLabelText('Category'), filterBar().getByRole('option', { name: 'Transport' }))

    await waitFor(() => expect(payees()).toEqual(['Grab refund', 'Grab', 'Aeon']))
    // The split adds only its line in Transport, and the refund is money back: 180,000 + 90,000 - 40,000.
    expect(total()).toBe('3 transactions' + 'VND' + 'Income₫0' + 'Expenses₫230,000' + 'Net-₫230,000')
  })

  it('lists the legs of a transfer, which can be filtered for, and leaves them out of the income and expenses of the total', async () => {
    fakeApis([
      { type: 'transferOut', accountId: everyday, amount: '2000000.00', date: '2026-11-02', transferId: 't-1' },
      { type: 'transferIn', accountId: dollars, amount: '80.00', date: '2026-11-02', transferId: 't-1' },
      { type: 'expense', accountId: everyday, amount: '45000.00', date: '2026-10-28', categoryId: 'c-transport', payee: 'Grab' },
    ])
    const { user, router } = renderApp('/transactions')
    await listShown()

    expect(payees()).toEqual(['Transfer in', 'Transfer out', 'Grab'])
    // Three transactions; the dollars that arrived are no income, so there is no total in dollars.
    expect(total()).toBe('3 transactions' + 'VND' + 'Income₫0' + 'Expenses₫45,000' + 'Net-₫45,000')

    await user.selectOptions(filterBar().getByLabelText('Type'), 'Transfer out')
    await waitFor(() => expect(payees()).toEqual(['Transfer out']))
    expect(router.state.location.search).toBe('?type=transferOut')
    expect(total()).toBe('1 transaction')
  })

  it('says so when nothing passes the filters, and clears them all at once', async () => {
    fakeApis()
    const { user, router } = renderApp('/transactions?q=nothing-has-this&type=income&sort=amount')

    expect(await screen.findByText('No transactions match these filters.')).toBeInTheDocument()
    expect(screen.queryByText('No transactions yet. Add your first income or expense.')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))

    await listShown()
    expect(payees()).toEqual(['Viettel', 'Co.opmart', 'Phở Thìn', 'Grab', 'Acme', 'Pizza 4P’s'])
    // The sort order is not a filter: it stays.
    expect(router.state.location.search).toBe('?sort=amount')
    expect(filterBar().getByLabelText('Search payee and note')).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  })

  it('shows skeletons while it loads, at first and again for each new view', async () => {
    const api = fakeApis()
    const release = api.holdLists()
    const { user } = renderApp('/transactions')

    expect(await screen.findByRole('list', { name: 'Loading transactions' })).toBeInTheDocument()
    release()
    await listShown()
    expect(screen.queryByRole('list', { name: 'Loading transactions' })).not.toBeInTheDocument()

    const releaseAgain = api.holdLists()
    await user.selectOptions(filterBar().getByLabelText('Type'), 'Income')
    expect(await screen.findByRole('list', { name: 'Loading transactions' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Transactions' })).not.toBeInTheDocument()
    releaseAgain()
    await waitFor(() => expect(payees()).toEqual(['Acme', 'Viettel']))
  })
})

describe('the transaction list, laid out', () => {
  const rowHeight = 64

  /** jsdom lays nothing out and the test screen fits every row. This gives each row a height, and the screen room for twelve. */
  function layOutRows() {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(rowHeight)
    window.innerHeight = 12 * rowHeight
    // A page long enough to scroll through: the list does not follow a scroll past the end of the page.
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 1000 * rowHeight, configurable: true })
  }

  function scrollTo(row: number) {
    Object.defineProperty(window, 'scrollY', { value: row * rowHeight, configurable: true })
    fireEvent.scroll(window)
  }

  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
    Reflect.deleteProperty(document.documentElement, 'scrollHeight')
  })

  it('keeps only the rows near the screen in the page, and loads the next page as the end comes into view', async () => {
    const api = fakeApis(Array.from({ length: 120 }, (_, index) => ({ payee: `Shop ${String(index + 1).padStart(3, '0')}`, amount: '1.00' })))
    layOutRows()
    renderApp('/transactions')

    // The last seeded is the last recorded, so it is listed first.
    await screen.findByRole('heading', { name: 'Shop 120' })
    expect(payees().length).toBeLessThan(30)
    expect(screen.queryByRole('heading', { name: 'Shop 090' })).not.toBeInTheDocument()
    expect(total()).toContain('120 transactions')
    expect(api.listQueries).toHaveLength(1)

    scrollTo(30)
    await screen.findByRole('heading', { name: 'Shop 090' })
    expect(screen.queryByRole('heading', { name: 'Shop 120' })).not.toBeInTheDocument()
    expect(payees().length).toBeLessThan(30)

    // The 50th row ends the first page.
    scrollTo(45)
    await screen.findByRole('heading', { name: 'Shop 071' })
    await waitFor(() => expect(api.listQueries).toHaveLength(2))
    scrollTo(60)
    expect(await screen.findByRole('heading', { name: 'Shop 060' })).toBeInTheDocument()
    expect(api.listQueries).toHaveLength(2)
  })

  it('shows skeletons under the rows while the next page loads', async () => {
    const api = fakeApis(Array.from({ length: 60 }, (_, index) => ({ payee: `Shop ${String(index + 1).padStart(2, '0')}`, amount: '1.00' })))
    layOutRows()
    renderApp('/transactions')
    await screen.findByRole('heading', { name: 'Shop 60' })

    const release = api.holdLists()
    scrollTo(45)

    expect(await screen.findByRole('list', { name: 'Loading more transactions' })).toBeInTheDocument()
    release()
    scrollTo(50)
    expect(await screen.findByRole('heading', { name: 'Shop 01' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Loading more transactions' })).not.toBeInTheDocument()
  })
})
