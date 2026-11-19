import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

export const testUser = { id: '01970000-0000-7000-8000-000000000001', email: 'ana@example.com' }
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
 * A stand-in for the API's sign-in endpoints, keeping state across requests and following the same
 * rules as the real API (see the API's AuthTests). Returns what it recorded, for assertions.
 */
export function fakeAuthApi({ signedIn = false, users = [{ ...testUser, password: testPassword, verified: true }] }: { signedIn?: boolean; users?: FakeUser[] } = {}) {
  const state = {
    users: [...users],
    signedInAs: signedIn ? (users[0] ?? null) : (null as FakeUser | null),
    resentTo: [] as string[],
    registered: [] as string[],
    /** The language each registration asked for, in order. */
    registeredIn: [] as (string | undefined)[],
    verifications: [] as { userId: string; token: string }[],
  }

  const refuseWithoutToken = (request: Request) => (hasAntiforgeryToken(request) ? null : problem(400))
  const noContent = () => new HttpResponse(null, { status: 204 })

  server.use(
    http.get(url('/api/v1/me'), () =>
      state.signedInAs ? HttpResponse.json({ id: state.signedInAs.id, email: state.signedInAs.email }) : problem(401),
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
      const { email, password, language } = (await request.json()) as { email: string; password: string; language?: string }
      if (language !== undefined && language !== 'en' && language !== 'vi') return problem(400, { errors: { language: ['Choose English (en) or Vietnamese (vi).'] } })
      if (password.length < 12) return problem(400, { errors: { password: ['Passwords must be at least 12 characters.'] } })
      // Stands for anything only the server can judge about an address.
      if (email.endsWith('.invalid')) return problem(400, { errors: { email: ['Enter a valid email address.'] } })
      state.registered.push(email)
      state.registeredIn.push(language)
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

type CategoryKind = 'income' | 'expense'

export type FakeCategory = {
  id: string
  parentId: string | null
  name: string
  kind: CategoryKind
  icon: string
  color: string
  isArchived: boolean
}

/** A small default set, like the one the API creates at registration. */
export const defaultTestCategories: FakeCategory[] = [
  { id: 'c-food', parentId: null, name: 'Food & drink', kind: 'expense', icon: 'utensils', color: '#f97316', isArchived: false },
  { id: 'c-groceries', parentId: 'c-food', name: 'Groceries', kind: 'expense', icon: 'shopping-cart', color: '#f97316', isArchived: false },
  { id: 'c-eating-out', parentId: 'c-food', name: 'Eating out', kind: 'expense', icon: 'utensils', color: '#f97316', isArchived: false },
  { id: 'c-transport', parentId: null, name: 'Transport', kind: 'expense', icon: 'car', color: '#3b82f6', isArchived: false },
  { id: 'c-salary', parentId: null, name: 'Salary', kind: 'income', icon: 'wallet', color: '#22c55e', isArchived: false },
  { id: 'c-investments', parentId: null, name: 'Investments', kind: 'income', icon: 'trending-up', color: '#84cc16', isArchived: false },
  { id: 'c-interest', parentId: 'c-investments', name: 'Interest', kind: 'income', icon: 'piggy-bank', color: '#84cc16', isArchived: false },
]

/**
 * A stand-in for the API's category endpoints, keeping state across requests and following the same
 * rules as the real API (see the API's CategoryTests): two levels deep, a subcategory has its parent's
 * kind, the kind is fixed once a category has transactions, archiving takes the subcategories along.
 */
export function fakeCategoriesApi({
  categories = defaultTestCategories,
  withTransactions = [],
}: { categories?: FakeCategory[]; withTransactions?: string[] } = {}) {
  const state = {
    categories: categories.map((category) => ({ ...category })),
    requests: [] as { method: string; body: unknown }[],
  }

  const refuseWithoutToken = (request: Request) => (hasAntiforgeryToken(request) ? null : problem(400))
  const invalid = (field: string, message: string) => problem(400, { errors: { [field]: [message] } })
  const find = (id: unknown) => state.categories.find((category) => category.id === id)
  const subcategoriesOf = (id: string) => state.categories.filter((category) => category.parentId === id)
  type CategoryJson = FakeCategory & { subcategories: CategoryJson[] }
  const view = (category: FakeCategory, all: FakeCategory[]): CategoryJson => ({
    ...category,
    subcategories: category.parentId === null ? all.filter((sub) => sub.parentId === category.id).map((sub) => view(sub, all)) : [],
  })
  const checkFields = (body: { name?: string; kind?: string; icon?: string; color?: string }) => {
    if (!body.name?.trim()) return invalid('name', 'Enter a name.')
    if (body.kind !== 'income' && body.kind !== 'expense') return invalid('kind', 'Choose income or expense.')
    if (!body.icon) return invalid('icon', 'Choose an icon.')
    if (!/^#[0-9a-fA-F]{6}$/.test(body.color ?? '')) return invalid('color', 'Choose a colour.')
    return null
  }

  server.use(
    http.get(url('/api/v1/categories'), ({ request }) => {
      const includeArchived = new URL(request.url).searchParams.get('includeArchived') === 'true'
      const visible = state.categories.filter((category) => includeArchived || !category.isArchived)
      return HttpResponse.json(visible.filter((category) => category.parentId === null).map((category) => view(category, visible)))
    }),
    http.post(url('/api/v1/categories'), async ({ request }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const body = (await request.json()) as Omit<FakeCategory, 'id' | 'isArchived'>
      state.requests.push({ method: 'POST', body })
      const wrong = checkFields(body)
      if (wrong) return wrong
      const parent = body.parentId ? find(body.parentId) : undefined
      if (body.parentId && !parent) return problem(404)
      if (parent?.parentId) return invalid('parentId', 'Categories can be at most two levels deep.')
      if (parent?.isArchived) return invalid('parentId', 'An archived category takes no new subcategories.')
      if (parent && parent.kind !== body.kind) return invalid('kind', "A subcategory has its parent's kind.")
      const created: FakeCategory = { ...body, parentId: body.parentId ?? null, name: body.name.trim(), id: crypto.randomUUID(), isArchived: false }
      state.categories.push(created)
      return HttpResponse.json(view(created, []), { status: 201 })
    }),
    http.put(url('/api/v1/categories/:id'), async ({ request, params }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const body = (await request.json()) as Pick<FakeCategory, 'name' | 'kind' | 'icon' | 'color'>
      state.requests.push({ method: 'PUT', body })
      const wrong = checkFields(body)
      if (wrong) return wrong
      const category = find(params.id)
      if (!category) return problem(404)
      const subcategories = subcategoriesOf(category.id)
      if (body.kind !== category.kind) {
        if (category.parentId) return invalid('kind', "A subcategory has its parent's kind.")
        if ([category, ...subcategories].some((each) => withTransactions.includes(each.id))) {
          return invalid('kind', "A category's kind cannot change once it has transactions.")
        }
        for (const each of [category, ...subcategories]) each.kind = body.kind
      }
      Object.assign(category, { name: body.name.trim(), icon: body.icon, color: body.color })
      return HttpResponse.json(view(category, state.categories))
    }),
    http.delete(url('/api/v1/categories/:id'), ({ request, params }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const category = find(params.id)
      if (!category) return problem(404)
      for (const each of [category, ...subcategoriesOf(category.id)]) each.isArchived = true
      return new HttpResponse(null, { status: 204 })
    }),
  )

  return state
}
