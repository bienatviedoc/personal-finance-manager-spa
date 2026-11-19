import { http, HttpResponse } from 'msw'
import { apiUrl as url, hasAntiforgeryToken, problem, server, testPassword, testUser } from './server'

type FakeUser = { id: string; email: string; password: string; verified: boolean; locale?: 'en' | 'vi' | null }

/**
 * A stand-in for the API's sign-in endpoints, keeping state across requests and following the same
 * rules as the real API (see the API's AuthTests). Returns what it recorded, for assertions.
 */
export function fakeAuthApi({ signedIn = false, users = [{ ...testUser, password: testPassword, verified: true }] }: { signedIn?: boolean; users?: FakeUser[] } = {}) {
  const state = {
    users: [...users],
    signedInAs: signedIn ? (users[0] ?? null) : (null as FakeUser | null),
    resentTo: [] as string[],
    registered: [] as string[],
    /** The locale each registration asked for, in order. */
    registeredIn: [] as (string | undefined)[],
    verifications: [] as { userId: string; token: string }[],
    resetRequestedFor: [] as string[],
    usedResetTokens: [] as string[],
  }

  const refuseWithoutToken = (request: Request) => (hasAntiforgeryToken(request) ? null : problem(400))
  const noContent = () => new HttpResponse(null, { status: 204 })

  server.use(
    http.get(url('/api/v1/me'), () =>
      state.signedInAs ? HttpResponse.json({ ...testUser, id: state.signedInAs.id, email: state.signedInAs.email, locale: state.signedInAs.locale ?? null }) : problem(401),
    ),
    http.post(url('/api/v1/auth/login'), async ({ request }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const { email, password } = (await request.json()) as { email: string; password: string }
      const found = state.users.find((user) => user.email === email && user.password === password)
      if (!found) return problem(401)
      if (!found.verified) return problem(403, { type: 'urn:pfm:problem:email-not-verified' })
      state.signedInAs = found
      return noContent()
    }),
    http.post(url('/api/v1/auth/logout'), ({ request }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      if (!state.signedInAs) return problem(401)
      state.signedInAs = null
      return noContent()
    }),
    http.post(url('/api/v1/auth/resend-verification'), async ({ request }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const { email } = (await request.json()) as { email: string }
      state.resentTo.push(email)
      return new HttpResponse(null, { status: 202 })
    }),
    http.post(url('/api/v1/auth/register'), async ({ request }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const { email, password, locale } = (await request.json()) as { email: string; password: string; locale?: string }
      if (locale !== undefined && locale !== 'en' && locale !== 'vi') return problem(400, { errors: { locale: ['Choose one of: en, vi.'] } })
      if (password.length < 12) return problem(400, { errors: { password: ['Passwords must be at least 12 characters.'] } })
      // Stands for anything only the server can judge about an address.
      if (email.endsWith('.invalid')) return problem(400, { errors: { email: ['Enter a valid email address.'] } })
      state.registered.push(email)
      state.registeredIn.push(locale)
      if (!state.users.some((user) => user.email === email)) {
        state.users.push({ id: crypto.randomUUID(), email, password, verified: false, locale: locale ?? null })
      }
      return new HttpResponse(null, { status: 202 })
    }),
    http.post(url('/api/v1/auth/verify-email'), async ({ request }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const body = (await request.json()) as { userId: string; token: string }
      state.verifications.push(body)
      const found = state.users.find((user) => user.id === body.userId)
      if (!found || body.token !== 'valid-token') return problem(400)
      found.verified = true
      return noContent()
    }),
    http.post(url('/api/v1/auth/forgot-password'), async ({ request }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const { email } = (await request.json()) as { email: string }
      state.resetRequestedFor.push(email)
      return new HttpResponse(null, { status: 202 })
    }),
    // Any token starting with 'valid-reset' works once; the password is checked before the link.
    http.post(url('/api/v1/auth/reset-password'), async ({ request }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const body = (await request.json()) as { userId: string; token: string; password: string }
      if (body.password.length < 12) return problem(400, { errors: { password: ['Passwords must be at least 12 characters.'] } })
      const found = state.users.find((user) => user.id === body.userId)
      if (!found || !body.token.startsWith('valid-reset') || state.usedResetTokens.includes(body.token)) {
        return problem(400, { type: 'urn:pfm:problem:reset-link-invalid' })
      }
      state.usedResetTokens.push(body.token)
      found.password = body.password
      return noContent()
    }),
  )

  return state
}
