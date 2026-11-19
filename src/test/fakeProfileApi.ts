import { http, HttpResponse } from 'msw'
import type { components } from '@/shared/api/schema'
import { apiUrl as url, hasAntiforgeryToken, problem, server, testUser } from './server'

type ProfileResponse = components['schemas']['UserProfile']

/**
 * A stand-in for GET and PATCH /me, signed in as `testUser` with the given settings, following the same
 * rules as the real API (see the API's ProfileTests). Returns the profile as it stands, and every change sent.
 */
export function fakeProfileApi(settings: Partial<Omit<ProfileResponse, 'id' | 'email'>> = {}) {
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
