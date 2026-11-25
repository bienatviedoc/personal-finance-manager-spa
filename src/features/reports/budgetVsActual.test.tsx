import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeAccountsApi } from '@/test/fakeAccountsApi'
import { fakeCategoriesApi } from '@/test/fakeCategoriesApi'
import { fakeReportsApi, type FakeBudget, type FakeExpense } from '@/test/fakeReportsApi'
import { renderApp } from '@/test/renderApp'

const report = '/reports/budget-vs-actual'
const march = 'period=custom&from=2026-03-01&to=2026-03-31'

/** March 2026: food within its budget, transport near its own, and coffee with no budget at all. */
const budgets: FakeBudget[] = [
  { month: '2026-03', categoryId: 'c-food', amount: '3000000' },
  { month: '2026-03', categoryId: 'c-transport', amount: '500000' },
]
const expenses: FakeExpense[] = [
  { id: 't-market', date: '2026-03-02', categoryId: 'c-groceries', spent: '1200000' },
  { id: 't-dinner', date: '2026-03-05', categoryId: 'c-food', spent: '300000' },
  { id: 't-bus', date: '2026-03-31', categoryId: 'c-transport', spent: '450000' },
  { id: 't-taxi', date: '2026-02-20', categoryId: 'c-transport', spent: '999000' },
]

function setUp(options: { budgets?: FakeBudget[]; expenses?: FakeExpense[] } = {}) {
  fakeCategoriesApi()
  fakeAccountsApi([{ id: 'a-everyday', name: 'Everyday' }])
  return fakeReportsApi({ budgets, expenses, ...options })
}

const rowsOf = async (name: string | RegExp) =>
  within(await screen.findByRole('table', { name }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => [...within(row).queryAllByRole('rowheader'), ...within(row).getAllByRole('cell')].map((cell) => cell.textContent))

describe('the budget vs actual report', () => {
  it('sets each budget of a month against what was spent in its category and subcategories, with the totals', async () => {
    const api = setUp()
    renderApp(`${report}?${march}&view=table`)

    expect(await screen.findByRole('heading', { level: 2, name: 'Budget vs actual' })).toBeInTheDocument()
    expect(await rowsOf('Budget vs actual')).toEqual([
      ['Food & drink', '₫3,000,000', '₫1,500,000', '₫1,500,000', '50%', 'On track'],
      ['Transport', '₫500,000', '₫450,000', '₫50,000', '90%', 'Warning'],
      ['Total', '₫3,500,000', '₫1,950,000', '₫1,550,000', '', ''],
    ])
    expect(api.budgetVsActualAsked.at(-1)).toEqual({ from: '2026-03-01', to: '2026-03-31' })
  })
})
