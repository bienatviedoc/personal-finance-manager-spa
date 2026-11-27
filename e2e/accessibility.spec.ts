import path from 'node:path'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { expectNoAccessibilityViolations } from './support/accessibility.ts'
import { choose, signIn } from './support/ui.ts'

// axe on the main screens (spec sections 8 and 13): each fails on any WCAG 2.1 AA violation, in the light theme and
// the dark one. Signed in as a user with a year of sample data (the API's seed command, run by scripts/e2e.sh), so
// the screens show full lists, budgets and charts rather than their empty states.
const sample = {
  email: process.env.PFM_E2E_SAMPLE_EMAIL ?? 'sample@example.com',
  password: process.env.PFM_E2E_SAMPLE_PASSWORD ?? 'sample data password',
}
const statement = path.resolve(
  process.env.PFM_API_DIR ?? '../personal-finance-manager-api',
  'tests/statements/synthetic-stand-ins/vietcombank-sample.csv',
)

const themes = ['light', 'dark'] as const

/**
 * Checks the screen in each theme once it has finished loading and nothing on it is still moving: a colour
 * caught half-way through the switch to the dark theme, or a chart's tooltip under the pointer, is not what anyone
 * reads.
 */
async function checkInEachTheme(page: Page, screen: string) {
  await page.waitForLoadState('networkidle')
  await page.mouse.move(0, 0)
  for (const colorScheme of themes) {
    await page.emulateMedia({ colorScheme })
    // The theme follows the change a frame later, and its colours then take a moment to settle.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running'))
    await expectNoAccessibilityViolations(page, test.info(), `${screen} (${colorScheme})`)
  }
}

test.describe('signed out', () => {
  for (const [screen, url] of [
    ['Sign in', '/login'],
    ['Register', '/register'],
    ['Forgot your password', '/forgot-password'],
  ]) {
    test(`${screen} meets WCAG 2.1 AA`, async ({ page }) => {
      await page.goto(url)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await checkInEachTheme(page, screen)
    })
  }
})

test.describe('signed in', () => {
  let context: BrowserContext
  let page: Page

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext()
    await signIn(await context.newPage(), sample.email, sample.password)
  })

  test.beforeEach(async () => {
    page = await context.newPage()
  })

  test.afterEach(async () => {
    await page.close()
  })

  test.afterAll(async () => {
    await context.close()
  })

  for (const [screen, url] of [
    ['Dashboard', '/'],
    ['Transactions', '/transactions'],
    ['Accounts', '/accounts'],
    ['Institutions', '/accounts/institutions'],
    ['Budgets', '/budgets'],
    ['Recurring', '/recurring'],
    ['Import', '/import'],
    ['Settings: profile', '/settings/profile'],
    ['Settings: categories', '/settings/categories'],
    ['Settings: categorisation rules', '/settings/categorisation-rules'],
    ['Settings: security', '/settings/security'],
    ['Settings: audit log', '/settings/audit-log'],
    ['Settings: data', '/settings/data'],
  ]) {
    test(`${screen} meets WCAG 2.1 AA`, async () => {
      await page.goto(url)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await checkInEachTheme(page, screen)
    })
  }

  for (const report of ['spending-by-category', 'trends', 'income-vs-expenses', 'budget-vs-actual', 'net-worth', 'cash-flow']) {
    test(`the ${report} report meets WCAG 2.1 AA, as a chart and as a table`, async () => {
      await page.goto(`/reports/${report}`)
      if (report === 'trends') {
        // Trends follow one category (or payee), and show nothing until one is chosen.
        await page.getByRole('search', { name: 'Report filters' }).getByLabel('Category').selectOption({ label: 'Food & drink' })
      }
      await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
      await checkInEachTheme(page, `${report} chart`)
      await choose(page.getByRole('main'), 'Table')
      await expect(page.getByRole('table').first()).toBeVisible()
      await checkInEachTheme(page, `${report} table`)
    })
  }

  test('a new transaction and a new transfer meet WCAG 2.1 AA', async () => {
    await page.goto('/transactions')
    await page.getByRole('button', { name: 'Add transaction' }).click()
    await expect(page.getByRole('dialog', { name: 'New transaction' })).toBeVisible()
    await checkInEachTheme(page, 'New transaction')
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Transfer between accounts' }).click()
    await expect(page.getByRole('dialog', { name: 'New transfer' })).toBeVisible()
    await checkInEachTheme(page, 'New transfer')
  })

  test('mapping and previewing a statement meet WCAG 2.1 AA', async () => {
    await page.goto('/import')
    await page.getByLabel('Account').selectOption({ index: 1 })
    await page.getByLabel('Statement file (CSV)').setInputFiles(statement)
    await page.getByRole('button', { name: 'Upload' }).click()
    await expect(page.getByRole('table', { name: 'The statement as uploaded' })).toBeVisible()
    await checkInEachTheme(page, 'Statement mapping')

    const layout = page.getByRole('group', { name: 'How to read the file' })
    await layout.getByLabel('Rows to skip at the end').fill('1')
    await layout.getByLabel('Date column').selectOption('Ngày giao dịch')
    await choose(layout, 'Debit and credit columns')
    await layout.getByLabel('Debit column (money out)').selectOption('Số tiền ghi nợ')
    await layout.getByLabel('Credit column (money in)').selectOption('Số tiền ghi có')
    await expect(page.getByRole('form', { name: 'Import the rows ticked' })).toBeVisible()
    await checkInEachTheme(page, 'Statement preview')
  })
})
