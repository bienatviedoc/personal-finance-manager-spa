import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { expectNoAccessibilityViolations } from './support/accessibility.ts'
import { syntheticStatement } from './support/statements.ts'
import { choose, signIn } from './support/ui.ts'

// axe on the main screens (spec sections 8 and 13): each fails on any WCAG 2.1 AA violation, in the light theme and
// the dark one. Signed in as a user with a year of sample data (the API's seed command, run by scripts/e2e.sh), so
// the screens show full lists, budgets and charts rather than their empty states.
const sample = {
  email: process.env.PFM_E2E_SAMPLE_EMAIL ?? 'sample@example.com',
  password: process.env.PFM_E2E_SAMPLE_PASSWORD ?? 'sample data password',
}
const statement = syntheticStatement('vietcombank-sample.csv')

const themes = ['light', 'dark'] as const

/**
 * Checks the screen in each theme once it has finished loading and nothing on it is still moving: a colour
 * caught half-way through the switch to the dark theme, or a chart's tooltip under the pointer, is not what anyone
 * reads. A screen that could not load what it shows says so in an alert, and is not the screen to check: an API
 * without an endpoint the screen needs fails here rather than passing on an error message.
 */
async function checkInEachTheme(page: Page, screen: string) {
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('alert'), `${screen} shows no error`).toHaveCount(0)
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

  // Each screen with what it shows once it has loaded, beside its heading.
  const screens: [string, string, (page: Page) => Locator][] = [
    ['Dashboard', '/', (page) => page.getByRole('main').getByRole('heading', { level: 2 }).first()],
    ['Transactions', '/transactions', (page) => page.getByRole('button', { name: 'Add transaction' })],
    ['Accounts', '/accounts', (page) => page.locator('main a[href^="/accounts/0"]').first()],
    ['Institutions', '/accounts/institutions', (page) => page.getByRole('button', { name: /^Edit / }).first()],
    ['Budgets', '/budgets', (page) => page.getByRole('main').getByRole('heading', { level: 2 }).first()],
    ['Recurring', '/recurring', (page) => page.getByRole('main').getByRole('list').first().or(page.getByText('No recurring rules yet.', { exact: false }))],
    ['Import', '/import', (page) => page.getByLabel('Statement file (CSV)')],
    ['Reports', '/reports', (page) => page.getByRole('main').getByRole('heading', { level: 2 }).first()],
    ['Recently deleted', '/transactions/deleted', (page) => page.getByRole('list', { name: 'Recently deleted' }).or(page.getByText('Nothing was deleted in the last 30 days.'))],
    ['Settings: profile', '/settings/profile', (page) => page.getByLabel('Base currency')],
    ['Settings: categories', '/settings/categories', (page) => page.getByRole('main').getByRole('list').first()],
    [
      'Settings: categorisation rules',
      '/settings/categorisation-rules',
      (page) => page.getByRole('list', { name: 'Rules, in the order they are tried' }).or(page.getByText('No rules yet.', { exact: false })),
    ],
    ['Settings: security', '/settings/security', (page) => page.getByRole('heading', { name: 'Two-factor sign-in' })],
    ['Settings: audit log', '/settings/audit-log', (page) => page.getByRole('list', { name: 'Audit log' })],
    ['Settings: data', '/settings/data', (page) => page.getByRole('button', { name: 'Export my data' })],
  ]

  for (const [screen, url, content] of screens) {
    test(`${screen} meets WCAG 2.1 AA`, async () => {
      await page.goto(url)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(content(page)).toBeVisible()
      await checkInEachTheme(page, screen)
    })
  }

  test('an account, and reconciling it, meet WCAG 2.1 AA', async () => {
    await page.goto('/accounts')
    await page.locator('main a[href^="/accounts/0"]').first().click()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: /^Reconcile / })).toBeVisible()
    await checkInEachTheme(page, 'Account')

    await page.getByRole('link', { name: /^Reconcile / }).click()
    const start = page.getByRole('form', { name: 'Start reconciliation' })
    const toTick = page.getByRole('list', { name: 'Transactions to tick' })
    await expect(start.or(toTick)).toBeVisible()
    await checkInEachTheme(page, 'Reconcile: a new statement')
    // A run before (a retry) may have left one in progress, which the screen opens at once.
    if (await start.isVisible()) {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())
      await start.getByLabel('Statement date').fill(today)
      await start.getByLabel(/^Closing balance/).fill('1000000')
      await start.getByRole('button', { name: 'Start reconciliation' }).click()
    }
    await expect(toTick).toBeVisible()
    await checkInEachTheme(page, 'Reconcile: ticking')
  })

  test('a categorisation rule being set up meets WCAG 2.1 AA', async () => {
    await page.goto('/settings/categorisation-rules')
    await page.getByRole('button', { name: 'Add rule' }).click()
    await expect(page.getByRole('form', { name: 'New rule' })).toBeVisible()
    await checkInEachTheme(page, 'New categorisation rule')
  })

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
    // As uploaded, until it is mapped; or, run again (a retry), read with the mapping saved for the account already.
    const raw = page.getByRole('table', { name: 'The statement as uploaded' })
    await expect(raw.or(page.getByRole('table', { name: 'Rows of the statement' }))).toBeVisible()
    await checkInEachTheme(page, 'Statement mapping')

    if (await raw.isVisible()) {
      const layout = page.getByRole('group', { name: 'How to read the file' })
      await layout.getByLabel('Rows to skip at the end').fill('1')
      await layout.getByLabel('Date column').selectOption('Ngày giao dịch')
      await choose(layout, 'Debit and credit columns')
      await layout.getByLabel('Debit column (money out)').selectOption('Số tiền ghi nợ')
      await layout.getByLabel('Credit column (money in)').selectOption('Số tiền ghi có')
    }
    const commit = page.getByRole('form', { name: 'Import the rows ticked' })
    await expect(commit).toBeVisible()
    await checkInEachTheme(page, 'Statement preview')

    // Imported, its screen follows the import, and it is listed among past imports with a way to undo it.
    for (const label of ['Category for money going out', 'Category for money coming in']) {
      const category = commit.getByLabel(label)
      if ((await category.inputValue()) === '') await category.selectOption({ index: 1 })
    }
    await commit.getByRole('button', { name: /^Import \d+ transactions?$/ }).click()
    await expect(page.getByRole('main').getByRole('status')).toBeVisible()
    await checkInEachTheme(page, 'An import')

    await page.goto('/import')
    const pastImports = page.getByRole('list', { name: 'Past imports' })
    await expect(pastImports).toBeVisible()
    await pastImports.getByRole('button', { name: 'Undo vietcombank-sample.csv' }).first().click()
    await expect(page.getByRole('group', { name: 'Undo vietcombank-sample.csv' })).toBeVisible()
    await checkInEachTheme(page, 'Past imports, undoing one')
  })
})
