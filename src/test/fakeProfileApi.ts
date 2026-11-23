import { http, HttpResponse } from 'msw'
import type { components } from '@/shared/api/schema'
import { apiUrl as url, problem, refuseWithoutToken, server, testUser } from './server'

type ProfileResponse = components['schemas']['ProfileResponse']

/**
 * A stand-in for GET and PATCH /me, signed in as `testUser` with the given settings, following the same
 * rules as the real API (see the API's ProfileTests and BudgetTests). Returns the profile as it stands, every change sent, and how often the profile was read.
 */
export function fakeProfileApi(settings: Partial<Omit<ProfileResponse, 'id' | 'email'>> = {}) {
  const state = { profile: { ...testUser, ...settings }, changes: [] as Record<string, unknown>[], /** How many times GET /me was asked. */ reads: 0 }
  const supported = { baseCurrency: ['VND', 'USD', 'EUR'], locale: ['en', 'vi'] } as Record<string, string[]>

  server.use(
    http.get(url('/api/v1/me'), () => {
      state.reads += 1
      return HttpResponse.json(state.profile)
    }),
    http.patch(url('/api/v1/me'), async ({ request }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const change = (await request.json()) as Record<string, string | number | null | undefined>
      state.changes.push(change)
      const errors = Object.fromEntries(
        Object.entries(change)
          .filter(([field, value]) => value != null && supported[field] && !supported[field].includes(String(value)))
          .map(([field]) => [field, ['Choose a supported value.']]),
      )
      const percent = change.budgetWarningPercent
      if (percent != null && !(Number.isInteger(percent) && Number(percent) >= 1 && Number(percent) <= 100)) {
        errors.budgetWarningPercent = ['Enter a whole percentage from 1 to 100.']
      }
      // The base currency locks once a budget exists (spec section 3, rule 12).
      if (state.profile.baseCurrencyLocked && change.baseCurrency != null && change.baseCurrency !== state.profile.baseCurrency) {
        errors.baseCurrency = ['The base currency is locked once a budget exists.']
      }
      if (Object.keys(errors).length > 0) return problem(400, { errors })
      const defined = Object.fromEntries(Object.entries(change).filter(([, value]) => value != null))
      state.profile = { ...state.profile, ...defined }
      return HttpResponse.json(state.profile)
    }),
  )

  return state
}
