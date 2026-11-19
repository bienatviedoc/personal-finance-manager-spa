import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

import type { components } from '@/shared/api/schema'

type ProfileResponse = components['schemas']['ProfileResponse']

/** The signed-in user, with the profile settings a new user starts with. */
export const testUser: ProfileResponse = {
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
