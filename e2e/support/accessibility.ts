import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, type TestInfo } from '@playwright/test'

/** The target of spec section 8: WCAG 2.1 AA, which includes level A and WCAG 2.0. */
const wcag21aa = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

/**
 * Checks the page as it is now with axe, and fails on any WCAG 2.1 AA violation, naming each with the elements at
 * fault. The full results are attached to the test report.
 */
export async function expectNoAccessibilityViolations(page: Page, testInfo: TestInfo, screen: string) {
  const results = await new AxeBuilder({ page }).withTags(wcag21aa).analyze()
  await testInfo.attach(`axe: ${screen}`, { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
  const found = results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.help}\n` +
      violation.nodes.map((node) => `    ${node.target.join(' ')}\n      ${node.failureSummary?.replaceAll('\n', '\n      ')}`).join('\n'),
  )
  expect.soft(found, `WCAG 2.1 AA violations on ${screen}`).toEqual([])
}
