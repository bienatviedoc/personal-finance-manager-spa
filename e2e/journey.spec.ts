import { expect, test, type Page } from '@playwright/test'
import { syntheticStatement } from './support/statements.ts'
import { choose, pick, registerAndVerify, signIn } from './support/ui.ts'

// The journey of spec section 13, from the outside, against the whole stack: one new user signs up, records money
// in and out, moves some between accounts, budgets, reads a report and imports a bank statement. Each step builds on
// the one before, in one browser that stays signed in.
test.describe.configure({ mode: 'serial' })

const email = `journey-${Date.now()}@example.com`
const password = 'a journey password'

let page: Page

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
})

test.afterAll(async () => {
  await page.close()
})

test('registers, confirms the email address and signs in', async () => {
  await registerAndVerify(page, email, password)
  await signIn(page, email, password)
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
})

test('adds an account to keep money in, and one to save into', async () => {
  for (const [name, type, openingBalance] of [
    ['Everyday', 'Current', '10000000'],
    ['Rainy day', 'Savings', '0'],
  ]) {
    await page.goto('/accounts')
    await page.getByRole('button', { name: 'Add account' }).click()
    const form = page.getByRole('region', { name: 'New account' })
    await form.getByLabel('Name').fill(name)
    await form.getByLabel('Type').selectOption(type)
    await form.getByLabel('Opening balance').fill(openingBalance)
    await form.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('heading', { name, level: 3 })).toBeVisible()
  }
})

test('adds an income and an expense', async () => {
  await page.goto('/transactions')
  for (const { type, amount, payee, category, option } of [
    { type: 'Income', amount: '25000000', payee: 'Acme Ltd', category: 'Salary', option: 'Salary' },
    { type: 'Expense', amount: '350000', payee: 'Corner market', category: 'Groceries', option: /Groceries/ },
  ]) {
    await page.getByRole('button', { name: 'Add transaction' }).click()
    const drawer = page.getByRole('dialog', { name: 'New transaction' })
    await choose(drawer, type)
    await drawer.getByLabel('Account').selectOption({ label: 'Everyday (VND)' })
    await drawer.getByLabel('Amount (VND)').fill(amount)
    await drawer.getByLabel('Payee').fill(payee)
    await pick(drawer, 'Category', category, option)
    await drawer.getByRole('button', { name: 'Save' }).click()
    // The drawer stays open to add another.
    await expect(drawer.getByRole('status')).toHaveText(/Saved/)
    await drawer.getByRole('button', { name: 'Done' }).click()
    await expect(drawer).toBeHidden()
  }

  const list = page.getByRole('list', { name: 'Transactions' })
  await expect(list.getByRole('listitem').filter({ hasText: 'Acme Ltd' })).toContainText('₫25,000,000')
  await expect(list.getByRole('listitem').filter({ hasText: 'Corner market' })).toContainText('-₫350,000')
})

test('makes a transfer between the two accounts', async () => {
  await page.goto('/transactions')
  await page.getByRole('button', { name: 'Transfer between accounts' }).click()
  const drawer = page.getByRole('dialog', { name: 'New transfer' })
  await drawer.getByLabel('From account').selectOption({ label: 'Everyday (VND)' })
  await drawer.getByLabel('To account').selectOption({ label: 'Rainy day (VND)' })
  await drawer.getByLabel('Amount (VND)').fill('5000000')
  await drawer.getByRole('button', { name: 'Save' }).click()
  await expect(drawer).toBeHidden()

  // 10,000,000 + 25,000,000 - 350,000 - 5,000,000, and the 5,000,000 moved.
  await page.goto('/accounts')
  await expect(accountCard('Everyday')).toContainText('₫29,650,000')
  await expect(accountCard('Rainy day')).toContainText('₫5,000,000')
})

test('sets a budget and sees what has been spent against it', async () => {
  await page.goto('/budgets')
  const groceries = page.getByRole('listitem', { name: 'Groceries' })
  const amount = groceries.getByRole('textbox', { name: 'Budget for Groceries' })
  await amount.fill('2000000')
  await amount.press('Enter')

  await expect(groceries.getByRole('progressbar', { name: 'Groceries: 17% of the budget spent' })).toBeVisible()
  await expect(groceries).toContainText('On track')
  await expect(groceries).toContainText('₫350,000')
  await expect(groceries).toContainText('₫1,650,000')
})

test('views the spending by category report', async () => {
  await page.goto('/reports')
  await page.getByRole('link', { name: 'Spending by category' }).click()
  const report = page.getByRole('region', { name: 'Spending by category' })
  await choose(report, 'Table')

  const table = report.getByRole('table', { name: 'Spending by category' })
  await expect(table.getByRole('row', { name: /Food & drink/ })).toContainText('₫350,000')
  await expect(table.getByRole('row', { name: /Food & drink/ })).toContainText('100%')
})

test('imports a bank statement saved as CSV', async () => {
  await page.goto('/import')
  await page.getByLabel('Account').selectOption({ label: 'Everyday (VND)' })
  await page.getByLabel('Statement file (CSV)').setInputFiles(syntheticStatement('vietcombank-sample.csv'))
  await page.getByRole('button', { name: 'Upload' }).click()
  await expect(page.getByRole('heading', { name: 'Import vietcombank-sample.csv' })).toBeVisible()

  // The layout of the statement, every choice made, whatever the screen suggests first (as its README says).
  const layout = page.getByRole('group', { name: 'How to read the file' })
  await layout.getByLabel('Separator', { exact: true }).selectOption({ label: 'Comma (,)' })
  await layout.getByLabel('Rows to skip at the start').fill('6')
  await layout.getByLabel('The next row names the columns').check()
  await layout.getByLabel('Rows to skip at the end').fill('1')
  await layout.getByLabel('Date column').selectOption('Ngày giao dịch')
  await layout.getByLabel('Description column').selectOption('Mô tả')
  await choose(layout, 'Debit and credit columns')
  await layout.getByLabel('Debit column (money out)').selectOption('Số tiền ghi nợ')
  await layout.getByLabel('Credit column (money in)').selectOption('Số tiền ghi có')
  await layout.getByLabel('Date format').selectOption({ label: 'Day, month, year (31/12/2026)' })
  await layout.getByLabel('Decimal separator').selectOption({ label: 'Dot (1,234.56)' })

  await expect(page.getByRole('checkbox', { name: /^Import row/ })).toHaveCount(56)
  const commit = page.getByRole('form', { name: 'Import the rows ticked' })
  await commit.getByLabel('Category for money going out').selectOption({ label: 'Other expenses' })
  await commit.getByLabel('Category for money coming in').selectOption({ label: 'Other income' })
  await commit.getByRole('button', { name: 'Import 56 transactions' }).click()

  // The worker imports it in the background.
  await expect(page.getByRole('status').filter({ hasText: '56 transactions imported.' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('link', { name: 'See them in the transactions' }).click()
  await page.getByRole('searchbox', { name: 'Search payee and note' }).fill('LUONG THANG 08')
  await expect(page.getByRole('list', { name: 'Transactions' }).getByRole('listitem')).toHaveCount(1)
  await expect(page.getByRole('list', { name: 'Transactions' })).toContainText('₫28,500,000')
})

function accountCard(name: string) {
  return page.getByRole('list', { name: /^Accounts of/ }).getByRole('listitem').filter({ has: page.getByRole('heading', { name, level: 3 }) })
}
