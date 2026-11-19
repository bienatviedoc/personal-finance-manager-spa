import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

import type { components } from '@/shared/api/schema'

type UserProfile = components['schemas']['UserProfile']

/** The signed-in user, with the profile settings a new user starts with. */
export const testUser: UserProfile = {
  id: '01970000-0000-7000-8000-000000000001',
  email: 'ana@example.com',
  baseCurrency: 'VND',
  timeZone: 'Asia/Ho_Chi_Minh',
  locale: null,
}
export const antiforgeryToken = 'test-antiforgery-token'

const url = (path: string) => `${window.location.origin}${path}`

/** The API as the SPA sees it, mocked at the network. Tests change it with `server.use(...)`. */
export const server = setupServer(
  http.get(url('/api/v1/auth/antiforgery'), () => HttpResponse.json({ token: antiforgeryToken })),
  http.get(url('/api/v1/me'), () => HttpResponse.json(testUser)),
)

/** Like the real API: a request that changes something without the anti-forgery token is refused. */
export function hasAntiforgeryToken(request: Request) {
  return request.headers.get('X-XSRF-TOKEN') === antiforgeryToken
}

export const apiUrl = url

export function problem(status: number, extra: Record<string, unknown> = {}) {
  return HttpResponse.json({ status, title: 'problem', ...extra }, { status, headers: { 'Content-Type': 'application/problem+json' } })
}

/** The visitor is not signed in: GET /me answers 401. */
export function signedOut() {
  return http.get(url('/api/v1/me'), () => problem(401))
}

export const testPassword = 'correct horse battery staple'

type FakeUser = { id: string; email: string; password: string; verified: boolean }

/**
 * A stand-in for GET and PATCH /me, signed in as `testUser` with the given settings, following the same
 * rules as the real API (see the API's ProfileTests). Returns the profile as it stands, and every change sent.
 */
export function fakeProfileApi(settings: Partial<Omit<UserProfile, 'id' | 'email'>> = {}) {
  const state = { profile: { ...testUser, ...settings }, changes: [] as Record<string, unknown>[] }
  const supported = { baseCurrency: ['VND', 'USD', 'EUR'], locale: ['en', 'vi'] } as Record<string, string[]>

  server.use(
    http.get(url('/api/v1/me'), () => HttpResponse.json(state.profile)),
    http.patch(url('/api/v1/me'), async ({ request }) => {
      if (!hasAntiforgeryToken(request)) return problem(400)
      const change = (await request.json()) as Record<string, string | null | undefined>
      state.changes.push(change)
      const errors = Object.fromEntries(
        Object.entries(change)
          .filter(([field, value]) => value != null && supported[field] && !supported[field].includes(value))
          .map(([field]) => [field, ['Choose a supported value.']]),
      )
      if (Object.keys(errors).length > 0) return problem(400, { errors })
      const defined = Object.fromEntries(Object.entries(change).filter(([, value]) => value != null))
      state.profile = { ...state.profile, ...defined }
      return HttpResponse.json(state.profile)
    }),
  )

  return state
}

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
    verifications: [] as { userId: string; token: string }[],
  }

  const refuseWithoutToken = (request: Request) => (hasAntiforgeryToken(request) ? null : problem(400))
  const noContent = () => new HttpResponse(null, { status: 204 })

  server.use(
    http.get(url('/api/v1/me'), () =>
      state.signedInAs ? HttpResponse.json({ ...testUser, id: state.signedInAs.id, email: state.signedInAs.email }) : problem(401),
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
      const { email, password } = (await request.json()) as { email: string; password: string }
      if (password.length < 12) return problem(400, { errors: { password: ['Passwords must be at least 12 characters.'] } })
      // Stands for anything only the server can judge about an address.
      if (email.endsWith('.invalid')) return problem(400, { errors: { email: ['Enter a valid email address.'] } })
      state.registered.push(email)
      if (!state.users.some((user) => user.email === email)) {
        state.users.push({ id: crypto.randomUUID(), email, password, verified: false })
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
  )

  return state
}
