import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { catchDownloads, textOf, type SavedFile } from '@/test/downloads'
import { fakeAccountsApi } from '@/test/fakeAccountsApi'
import { fakeCategoriesApi } from '@/test/fakeCategoriesApi'
import { fakeReportsApi, type FakeExpense } from '@/test/fakeReportsApi'
import { renderApp } from '@/test/renderApp'

const report = '/reports/spending-by-category'
const march = 'period=custom&from=2026-03-01&to=2026-03-31'

/** March 2026: groceries and coffee under Food & drink, and Transport on its own; February's transport to compare with. */
const expenses: FakeExpense[] = [
  { id: 't-market', date: '2026-03-02', categoryId: 'c-groceries', accountId: 'a-everyday', spent: '500000', payee: 'Market, central', note: 'weekly shop' },
  { id: 't-coffee', date: '2026-03-03', categoryId: 'c-eating-out', accountId: 'a-everyday', spent: '100000' },
  { id: 't-food', date: '2026-03-04', categoryId: 'c-food', accountId: 'a-card', spent: '200000' },
  { id: 't-bus', date: '2026-03-05', categoryId: 'c-transport', accountId: 'a-card', spent: '200000' },
  { id: 't-taxi', date: '2026-03-06', categoryId: 'c-transport', accountId: 'a-card', spent: null, amount: '12.50', currency: 'USD' },
  { id: 't-rent', date: '2026-02-05', categoryId: 'c-transport', accountId: 'a-card', spent: '300000' },
]

function setUp() {
  fakeCategoriesApi()
  fakeAccountsApi([
    { id: 'a-everyday', name: 'Everyday' },
    { id: 'a-card', name: 'Card' },
  ])
  return fakeReportsApi({ expenses })
}

describe('exporting a report', () => {
  let saved: SavedFile[] = []

  beforeEach(() => {
    saved = catchDownloads()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const exportReport = async (address: string) => {
    const { user } = renderApp(address)
    await user.click(await screen.findByRole('button', { name: 'Export CSV' }, { timeout: 5000 }))
    await waitFor(() => expect(saved).toHaveLength(1))
    return { name: saved[0]!.name, ...(await textOf(saved[0]!.file)) }
  }

  it('downloads the numbers of the table view as CSV: amounts as plain decimals beside the currency, the period in its name', async () => {
    setUp()

    expect(await exportReport(`${report}?${march}&view=table`)).toEqual({
      name: 'spending-by-category-2026-03-01-2026-03-31.csv',
      hasByteOrderMark: true,
      text: [
        'category,spent,share,notConverted,currency',
        'Food & drink,800000.00,80,0,VND',
        'Transport,200000.00,20,1,VND',
        '',
      ].join('\r\n'),
    })
  })

  it('adds what each category spent in the period before when the report compares, from the chart view too', async () => {
    setUp()

    expect((await exportReport(`${report}?${march}&compare=true`)).text).toBe(
      ['category,spent,share,previousSpent,notConverted,currency', 'Food & drink,800000.00,80,0.00,0,VND', 'Transport,200000.00,20,300000.00,1,VND', ''].join('\r\n'),
    )
  })

  it('downloads a category drilled into as its subcategories, named as the table names them', async () => {
    setUp()

    expect((await exportReport(`${report}?${march}&view=table&parentId=c-food`)).text).toBe(
      [
        'category,spent,share,notConverted,currency',
        'Groceries,500000.00,62.5,0,VND',
        'Food & drink (no subcategory),200000.00,25,0,VND',
        'Eating out,100000.00,12.5,0,VND',
        '',
      ].join('\r\n'),
    )
  })

  it("downloads a category's transactions with what each spent there, its amount beside its own currency", async () => {
    setUp()

    expect(await exportReport(`${report}?${march}&view=table&transactionsOf=c-transport`)).toEqual({
      name: 'spending-by-category-transactions-2026-03-01-2026-03-31.csv',
      hasByteOrderMark: true,
      text: [
        'date,payee,note,account,amount,currency,isRefund,isSplit,spent,baseCurrency',
        '2026-03-06,,,Card,12.50,USD,false,false,,VND',
        '2026-03-05,,,Card,200000.00,VND,false,false,200000.00,VND',
        '',
      ].join('\r\n'),
    })
  })
})
