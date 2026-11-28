import { expect, type Locator, type Page } from '@playwright/test'
import { linkEmailedTo } from './mail.ts'

/**
 * Picks a radio button drawn as a segmented control, whose input is visually hidden: by clicking its label, as
 * a user does.
 */
export async function choose(scope: Page | Locator, radio: string) {
  const page = 'page' in scope ? scope.page() : scope
  await scope.locator('label').filter({ has: page.getByRole('radio', { name: radio, exact: true }) }).click()
}

/** Picks an option of a type-ahead picker (such as a transaction's category) by typing and choosing it. */
export async function pick(scope: Page | Locator, picker: string, type: string, option: string | RegExp) {
  const combobox = scope.getByRole('combobox', { name: picker })
  await combobox.fill(type)
  const page = 'page' in scope ? scope.page() : scope
  await page.getByRole('option', { name: option }).click()
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
}

/** Registers a new user and confirms their email address from the link emailed to them. */
export async function registerAndVerify(page: Page, email: string, password: string) {
  await page.goto('/register')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Register' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()

  await page.goto(await linkEmailedTo(email, '/verify-email'))
  await expect(page.getByRole('status')).toHaveText(/confirmed/i)
}
