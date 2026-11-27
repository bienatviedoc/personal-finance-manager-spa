import { defineConfig, devices } from '@playwright/test'

// End-to-end and accessibility tests, run against the whole stack in Docker Compose: npm run e2e (see the README).
const port = process.env.PFM_E2E_PORT ?? '8081'

export default defineConfig({
  testDir: './e2e',
  // The journey's steps build on each other, and every test signs up through the one mail catcher.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.PFM_E2E_URL ?? `http://localhost:${port}`,
    locale: 'en-GB',
    timezoneId: 'Asia/Ho_Chi_Minh',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
