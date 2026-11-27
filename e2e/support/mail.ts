import { expect } from '@playwright/test'

/** Mailpit, which catches every email the API sends in the Compose stack. */
const mailpit = process.env.PFM_E2E_MAIL_URL ?? `http://localhost:${process.env.PFM_E2E_MAIL_PORT ?? '8026'}`

type Summary = { ID: string }
type Message = { Text: string }

/**
 * The link in the newest email sent to `email` that leads to `path` (such as /verify-email), as a path on the
 * app, so it opens wherever the tests point. Waits for the email to arrive.
 */
export async function linkEmailedTo(email: string, path: string): Promise<string> {
  let link: URL | undefined
  await expect(async () => {
    const search = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)
    const { messages } = (await search.json()) as { messages: Summary[] }
    expect(messages.length, `an email to ${email}`).toBeGreaterThan(0)
    const message = (await (await fetch(`${mailpit}/api/v1/message/${messages[0].ID}`)).json()) as Message
    const found = message.Text.match(/https?:\/\/\S+/g)?.map((text) => new URL(text)).find((url) => url.pathname === path)
    expect(found, `a link to ${path}`).toBeDefined()
    link = found
  }).toPass({ timeout: 15_000 })
  return link!.pathname + link!.search
}
