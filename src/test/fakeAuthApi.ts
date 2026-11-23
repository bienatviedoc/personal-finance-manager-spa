import { http, HttpResponse } from 'msw'
import { apiUrl as url, problem, refuseWithoutToken, server, testPassword, testUser } from './server'

type FakeUser = {
  id: string
  email: string
  password: string
  verified: boolean
  locale?: 'en' | 'vi' | null
  /** Set for a user who signs in with two factors: the code their authenticator shows, and their unused recovery codes. */
  twoFactor?: { code: string; recoveryCodes: string[] }
  /** Set for a user who asked to be deleted less than 30 days ago: signing in cancels it, and the API says so. */
  deactivated?: boolean
}

/** How many wrong passwords or codes in a row lock sign-in for a user, as in the real API. */
const attemptsBeforeLock = 5

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
    /** Wrong passwords or codes in a row, by email. */
    failedSignIns: {} as Record<string, number>,
    /** Set to have the next sign-in attempts answered 429, as a client over the rate limit is. */
    overRateLimit: false,
  }

  const noContent = () => new HttpResponse(null, { status: 204 })

  server.use(
    http.get(url('/api/v1/me'), () =>
      state.signedInAs ? HttpResponse.json({ ...testUser, id: state.signedInAs.id, email: state.signedInAs.email, locale: state.signedInAs.locale ?? null }) : problem(401),
    ),
    http.post(url('/api/v1/auth/login'), async ({ request }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      if (state.overRateLimit) return problem(429)
      const { email, password, twoFactorCode, recoveryCode } = (await request.json()) as {
        email: string
        password: string
        twoFactorCode?: string | null
        recoveryCode?: string | null
      }
      const failed = () => {
        state.failedSignIns[email] = (state.failedSignIns[email] ?? 0) + 1
      }
      const found = state.users.find((user) => user.email === email)
      if (!found) return problem(401)
      // A locked user is answered the way a wrong password is, even with the right one.
      if ((state.failedSignIns[email] ?? 0) >= attemptsBeforeLock) return problem(401)
      if (found.password !== password) {
        failed()
        return problem(401)
      }
      if (!found.verified) return problem(403, { type: 'urn:pfm:problem:email-not-verified' })
      if (found.twoFactor) {
        if (!twoFactorCode && !recoveryCode) return problem(401, { type: 'urn:pfm:problem:two-factor-required' })
        const codes = found.twoFactor.recoveryCodes
        const right = twoFactorCode ? twoFactorCode === found.twoFactor.code : codes.includes(recoveryCode!)
        if (!right) {
          failed()
          return problem(401, { type: 'urn:pfm:problem:two-factor-code-incorrect' })
        }
        // A recovery code works once.
        if (!twoFactorCode) codes.splice(codes.indexOf(recoveryCode!), 1)
      }
      state.failedSignIns[email] = 0
      state.signedInAs = found
      if (found.deactivated) {
        found.deactivated = false
        return HttpResponse.json({ deletionCancelled: true })
      }
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
