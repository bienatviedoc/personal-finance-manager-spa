import { http, HttpResponse } from 'msw'
import type { components } from '@/shared/api/schema'
import { apiUrl, hasAntiforgeryToken, problem, server } from './server'

type Institution = components['schemas']['InstitutionResponse']
type InstitutionRequest = components['schemas']['InstitutionRequest']

const logoKeys = ['bank', 'building', 'wallet', 'card', 'piggy-bank', 'coins', 'smartphone']

/**
 * A stand-in for the API's institution endpoints, keeping state across requests and following the
 * same rules as the real API (see the API's InstitutionTests): the list is by name and leaves out
 * archived institutions unless asked, deleting archives, and a bad field is refused by name.
 */
export function fakeInstitutionsApi(institutions: Partial<Institution>[] = []) {
  const state = {
    institutions: institutions.map((institution, index) => ({
      id: `01970000-0000-7000-8000-1000000000${String(index).padStart(2, '0')}`,
      name: `Institution ${index}`,
      color: null,
      logoKey: null,
      isArchived: false,
      ...institution,
    })) as Institution[],
  }

  const refuseWithoutToken = (request: Request) => (hasAntiforgeryToken(request) ? null : problem(400))
  const find = (id: unknown) => state.institutions.find((institution) => institution.id === id)

  async function validated(request: Request) {
    const body = (await request.json()) as InstitutionRequest
    const name = body.name?.trim() ?? ''
    const color = body.color ?? null
    const logoKey = body.logoKey ?? null
    const errors: Record<string, string[]> = {}
    if (name.length === 0 || name.length > 100) errors.name = ['Enter a name of at most 100 characters.']
    if (color !== null && !/^#[0-9a-fA-F]{6}$/.test(color)) errors.color = ['Enter a colour as #rrggbb.']
    if (logoKey !== null && !logoKeys.includes(logoKey)) errors.logoKey = ['Choose one of the logos on offer.']
    if (Object.keys(errors).length > 0) return { refused: problem(400, { errors }) }
    return { fields: { name, color: color?.toLowerCase() ?? null, logoKey } }
  }

  server.use(
    http.get(apiUrl('/api/v1/institutions'), ({ request }) => {
      const includeArchived = new URL(request.url).searchParams.get('includeArchived') === 'true'
      const items = state.institutions
        .filter((institution) => includeArchived || !institution.isArchived)
        .toSorted((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
      return HttpResponse.json({ items })
    }),
    http.get(apiUrl('/api/v1/institutions/:id'), ({ params }) => {
      const found = find(params.id)
      return found ? HttpResponse.json(found) : problem(404)
    }),
    http.post(apiUrl('/api/v1/institutions'), async ({ request }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const result = await validated(request)
      if (result.refused) return result.refused
      const created: Institution = { id: crypto.randomUUID(), isArchived: false, ...result.fields }
      state.institutions.push(created)
      return HttpResponse.json(created, { status: 201 })
    }),
    http.put(apiUrl('/api/v1/institutions/:id'), async ({ request, params }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const found = find(params.id)
      if (!found) return problem(404)
      const result = await validated(request)
      if (result.refused) return result.refused
      Object.assign(found, result.fields)
      return HttpResponse.json(found)
    }),
    http.delete(apiUrl('/api/v1/institutions/:id'), ({ request, params }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const found = find(params.id)
      if (!found) return problem(404)
      found.isArchived = true
      return new HttpResponse(null, { status: 204 })
    }),
  )

  return state
}
