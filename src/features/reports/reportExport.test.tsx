import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { catchDownloads, textOf, type SavedFile } from '@/test/downloads'
import { fakeAccountsApi } from '@/test/fakeAccountsApi'
import { fakeCategoriesApi } from '@/test/fakeCategoriesApi'
import { fakeReportsApi, type FakeBudget, type FakeExpense, type FakeHolding, type FakeIncome } from '@/test/fakeReportsApi'
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

let saved: SavedFile[] = []

beforeEach(() => {
  saved = catchDownloads()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Opens the report at the address, clicks its export, and gives back the file the browser was handed. */
const exportReport = async (address: string) => {
  const { user } = renderApp(address)
  await user.click(await screen.findByRole('button', { name: 'Export CSV' }, { timeout: 5000 }))
  await waitFor(() => expect(saved).toHaveLength(1))
  return { name: saved[0]!.name, ...(await textOf(saved[0]!.file)) }
}

describe('exporting the spending by category report', () => {
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

describe('exporting the net worth report', () => {
  it('downloads the assets, liabilities and net worth at each month end, liabilities above zero as the table shows them', async () => {
    fakeCategoriesApi()
    fakeAccountsApi([{ id: 'a-everyday', name: 'Everyday' }])
    const holdings: FakeHolding[] = [
      { accountId: 'a-everyday', from: '2026-01-01', balance: '1000000' },
      { accountId: 'a-visa', from: '2026-01-01', balance: '-300000', holdsAmountOwed: true },
      { accountId: 'a-loan', from: '2026-02-15', balance: '-5000000', holdsAmountOwed: true },
    ]
    fakeReportsApi({ holdings })

    expect(await exportReport('/reports/net-worth?period=custom&from=2026-01-01&to=2026-02-28')).toEqual({
      name: 'net-worth-2026-01-01-2026-02-28.csv',
      hasByteOrderMark: true,
      text: ['date,assets,liabilities,netWorth,notConverted,currency', '2026-01-31,1000000.00,300000.00,700000.00,0,VND', '2026-02-28,1000000.00,5300000.00,-4300000.00,0,VND', ''].join('\r\n'),
    })
  })
})

describe('exporting the income vs expenses report', () => {
  const income: FakeIncome[] = [
    { id: 't-january-salary', date: '2026-01-05', categoryId: 'c-salary', accountId: 'a-everyday', amount: '20000000' },
    { id: 't-march-salary', date: '2026-03-31', categoryId: 'c-salary', accountId: 'a-everyday', amount: '10000000' },
    { id: 't-december-salary', date: '2025-12-05', categoryId: 'c-salary', accountId: 'a-everyday', amount: '8000000' },
  ]
  const spent: FakeExpense[] = [
    { id: 't-car', date: '2026-01-20', categoryId: 'c-transport', accountId: 'a-everyday', spent: '15000000' },
    { id: 't-market', date: '2026-03-01', categoryId: 'c-groceries', accountId: 'a-everyday', spent: '12500000' },
    { id: 't-november', date: '2025-11-01', categoryId: 'c-groceries', accountId: 'a-everyday', spent: '6000000' },
  ]
  const firstQuarter = '/reports/income-vs-expenses?period=custom&from=2026-01-01&to=2026-03-31'

  function setUpIncome() {
    fakeCategoriesApi()
    fakeAccountsApi([{ id: 'a-everyday', name: 'Everyday' }])
    fakeReportsApi({ income, expenses: spent })
  }

  it('downloads each month and the whole period, each with its dates, and no savings rate where there was no income', async () => {
    setUpIncome()

    expect(await exportReport(firstQuarter)).toEqual({
      name: 'income-vs-expenses-2026-01-01-2026-03-31.csv',
      hasByteOrderMark: true,
      text: [
        'row,from,to,income,expenses,net,savingsRate,notConverted,currency',
        'month,2026-01-01,2026-01-31,20000000.00,15000000.00,5000000.00,25,0,VND',
        'month,2026-02-01,2026-02-28,0.00,0.00,0.00,,0,VND',
        'month,2026-03-01,2026-03-31,10000000.00,12500000.00,-2500000.00,-25,0,VND',
        'total,2026-01-01,2026-03-31,30000000.00,27500000.00,2500000.00,8.3,0,VND',
        '',
      ].join('\r\n'),
    })
  })

  it('adds the months and the whole of the period before when the report compares', async () => {
    setUpIncome()

    const { text } = await exportReport(`${firstQuarter}&compare=true`)

    expect(text.split('\r\n').slice(5)).toEqual([
      'previousMonth,2025-10-01,2025-10-31,0.00,0.00,0.00,,0,VND',
      'previousMonth,2025-11-01,2025-11-30,0.00,6000000.00,-6000000.00,,0,VND',
      'previousMonth,2025-12-01,2025-12-31,8000000.00,0.00,8000000.00,100,0,VND',
      'previousTotal,2025-10-01,2025-12-31,8000000.00,6000000.00,2000000.00,25,0,VND',
      '',
    ])
  })
})

describe('exporting the trends report', () => {
  const food: FakeExpense[] = [
    { id: 't-jan-market', date: '2026-01-10', categoryId: 'c-groceries', spent: '400000', payee: 'Market' },
    { id: 't-jan-coffee', date: '2026-01-20', categoryId: 'c-eating-out', spent: '100000', payee: 'Cafe' },
    { id: 't-mar-market', date: '2026-03-05', categoryId: 'c-groceries', spent: '600000', payee: 'market ' },
    { id: 't-dec-market', date: '2025-12-15', categoryId: 'c-food', spent: '250000', payee: 'Market' },
  ]
  const foodInQ1 = '/reports/trends?period=custom&from=2026-01-01&to=2026-03-31&categoryId=c-food'

  function setUpTrends() {
    fakeCategoriesApi()
    fakeAccountsApi([{ id: 'a-everyday', name: 'Everyday' }])
    fakeReportsApi({ expenses: food })
  }

  it("downloads the followed category's total in each month, with its change from the month before", async () => {
    setUpTrends()

    expect(await exportReport(foodInQ1)).toEqual({
      name: 'trends-2026-01-01-2026-03-31.csv',
      hasByteOrderMark: true,
      text: [
        'from,to,total,change,changePercent,notConverted,currency',
        '2026-01-01,2026-01-31,500000.00,,,0,VND',
        '2026-02-01,2026-02-28,0.00,-500000.00,-100,0,VND',
        '2026-03-01,2026-03-31,600000.00,600000.00,,0,VND',
        '',
      ].join('\r\n'),
    })
  })

  it('adds the month of the period before at the same place, and its total, when the report compares', async () => {
    setUpTrends()

    const lines = (await exportReport(`${foodInQ1}&compare=true`)).text.split('\r\n')

    expect(lines[0]).toBe('from,to,total,change,changePercent,notConverted,previousFrom,previousTo,previousTotal,currency')
    expect(lines.slice(1, 4).map((line) => line.split(',').slice(6, 9).join(','))).toEqual([
      '2025-10-01,2025-10-31,0.00',
      '2025-11-01,2025-11-30,0.00',
      '2025-12-01,2025-12-31,250000.00',
    ])
  })
})

describe('exporting the budget vs actual report', () => {
  it('downloads each budget against what was spent, with the totals, then what was spent with no budget', async () => {
    fakeCategoriesApi()
    fakeAccountsApi([{ id: 'a-everyday', name: 'Everyday' }])
    const budgets: FakeBudget[] = [
      { month: '2026-03', categoryId: 'c-groceries', amount: '2000000' },
      { month: '2026-03', categoryId: 'c-transport', amount: '500000' },
    ]
    fakeReportsApi({
      budgets,
      expenses: [
        { id: 't-market', date: '2026-03-02', categoryId: 'c-groceries', spent: '800000' },
        { id: 't-coffee', date: '2026-03-03', categoryId: 'c-eating-out', spent: '150000' },
        { id: 't-taxi', date: '2026-02-20', categoryId: 'c-transport', spent: '200000' },
      ],
    })

    expect(await exportReport('/reports/budget-vs-actual?period=custom&from=2026-02-01&to=2026-03-31')).toEqual({
      name: 'budget-vs-actual-2026-02-01-2026-03-31.csv',
      hasByteOrderMark: true,
      text: [
        'category,budgeted,spent,remaining,percentSpent,state,budgetedMonths,notConverted,currency',
        'Groceries,2000000.00,800000.00,1200000.00,40,onTrack,1,0,VND',
        'Transport,500000.00,0.00,500000.00,0,onTrack,1,0,VND',
        'Total,2500000.00,800000.00,1700000.00,,,,0,VND',
        'Transport,,200000.00,,,unbudgeted,,0,VND',
        'Eating out,,150000.00,,,unbudgeted,,0,VND',
        'Spent with no budget,,350000.00,,,unbudgeted,,0,VND',
        '',
      ].join('\r\n'),
    })
  })
})
