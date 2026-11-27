import { http, HttpResponse } from 'msw'
import type { components } from '@/shared/api/schema'
import type { FakeCategory } from './fakeCategoriesApi'
import { apiUrl as url, problem, refuseWithoutToken, server } from './server'

export type FakeRule = components['schemas']['CategorisationRuleResponse']
type RuleRequest = components['schemas']['CategorisationRuleRequest']

/** Text as the API compares it: without case, accents or extra spaces. */
const comparable = (text: string | null | undefined) =>
  (text ?? '').normalize('NFD').replace(/\p{Mn}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().split(/\s+/).filter(Boolean).join(' ')

/** The rules in the order the API tries them: highest priority first, and of equal ones the one set up first. */
const inOrder = (rules: (FakeRule & { order: number })[]) => rules.toSorted((a, b) => Number(b.priority) - Number(a.priority) || a.order - b.order)

/**
 * The category the user's rules give a payee or description, as the API's `Categoriser` picks it: of the rules that
 * match, on a category of the kind asked for (either, when none is) that is not archived, the highest priority; of
 * equal ones, the one set up first. Null when none matches.
 */
export function categoriseWith(rules: FakeRule[], categories: FakeCategory[], text: string | null | undefined, kind: 'income' | 'expense' | null): string | null {
  const looked = comparable(text)
  if (!looked) return null
  const matched = inOrder(rules.map((rule, order) => ({ ...rule, order }))).find((rule) => {
    const category = categories.find((candidate) => candidate.id === rule.categoryId)
    if (!category || category.isArchived || (kind && category.kind !== kind)) return false
    const match = comparable(rule.matchText)
    return rule.matchType === 'contains' ? looked.includes(match) : rule.matchType === 'startsWith' ? looked.startsWith(match) : looked === match
  })
  return matched?.categoryId ?? null
}

/**
 * A stand-in for the API's categorisation rule endpoints, keeping state across requests and following the same rules
 * as the real API (see the API's CategorisationRuleTests): listed whole in the order they are tried; set up on a
 * category of the user's that is not archived, with match text and a known match type, without a priority one above the
 * highest; edited keeping a category archived since, naming the row version in `If-Match` (412 when stale, 428 when
 * missing); reordered with every rule once and the row version it was read at, each taking its priority from its place
 * (the last 0): a rule named twice is a 400 on `rules`, and an order that is not every rule at its row version (one
 * set up, edited or deleted since) a 412; deleted for good. Every change moves the row version on.
 */
export function fakeCategorisationRulesApi({ rules = [], categories }: { rules?: Partial<FakeRule>[]; categories: FakeCategory[] }) {
  let made = 0
  const state = {
    rules: rules.map((rule, index): FakeRule & { order: number } => ({
      id: `01970000-0000-7000-8000-5000000000${String(index).padStart(2, '0')}`,
      matchText: 'grab',
      matchType: 'contains',
      categoryId: 'c-transport',
      priority: 0,
      rowVersion: '1',
      ...rule,
      order: index,
    })),
    requests: [] as { method: string; path: string; body: unknown }[],
    /** The `If-Match` header of every edit, in the order they arrived. */
    ifMatches: [] as (string | null)[],
  }
  const changed = (rule: FakeRule) => (rule.rowVersion = String(Number(rule.rowVersion) + 1))
  made = state.rules.length

  const view = (rule: FakeRule & { order: number }): FakeRule => ({
    id: rule.id,
    matchText: rule.matchText,
    matchType: rule.matchType,
    categoryId: rule.categoryId,
    priority: rule.priority,
    rowVersion: rule.rowVersion,
  })
  const listed = () => inOrder(state.rules).map(view)
  const invalid = (field: string, message: string) => problem(400, { errors: { [field]: [message] } })
  const check = (body: RuleRequest, keeping?: string) => {
    if (!body.matchText?.trim()) return invalid('matchText', 'Enter the text to look for, at most 100 characters.')
    if (!['contains', 'startsWith', 'exactly'].includes(body.matchType ?? '')) return invalid('matchType', 'Choose one of: contains, startsWith, exactly.')
    if (body.priority != null && (Number(body.priority) < 0 || Number(body.priority) > 1_000_000)) return invalid('priority', 'Enter a priority from 0 to 1000000.')
    const category = categories.find((candidate) => candidate.id === body.categoryId)
    if (!category || (category.isArchived && category.id !== keeping)) return invalid('categoryId', 'Choose one of your categories that is not archived.')
    return null
  }

  server.use(
    http.get(url('/api/v1/category-rules'), () => HttpResponse.json({ items: listed() })),
    http.post(url('/api/v1/category-rules'), async ({ request }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const body = (await request.json()) as RuleRequest
      state.requests.push({ method: 'POST', path: '/api/v1/category-rules', body })
      const wrong = check(body)
      if (wrong) return wrong
      const highest = Math.max(-1, ...state.rules.map((rule) => Number(rule.priority)))
      const rule = {
        id: `01970000-0000-7000-8000-5100000000${String(made).padStart(2, '0')}`,
        matchText: body.matchText.trim(),
        matchType: body.matchType!,
        categoryId: body.categoryId,
        priority: body.priority ?? highest + 1,
        rowVersion: '1',
        order: made++,
      } as FakeRule & { order: number }
      state.rules.push(rule)
      return HttpResponse.json(view(rule), { status: 201 })
    }),
    http.put(url('/api/v1/category-rules/order'), async ({ request }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const body = (await request.json()) as components['schemas']['CategorisationRuleOrderRequest']
      state.requests.push({ method: 'PUT', path: '/api/v1/category-rules/order', body })
      const sent = body.rules ?? []
      if (new Set(sent.map((rule) => rule.id)).size !== sent.length) return invalid('rules', 'List each of your rules once.')
      const atVersion = sent.every((each) => state.rules.some((rule) => rule.id === each.id && rule.rowVersion === each.rowVersion))
      if (sent.length !== state.rules.length || !atVersion) return problem(412)
      sent.forEach(({ id }, place) => {
        const rule = state.rules.find((candidate) => candidate.id === id)!
        if (Number(rule.priority) === sent.length - 1 - place) return
        rule.priority = sent.length - 1 - place
        changed(rule)
      })
      return HttpResponse.json({ items: listed() })
    }),
    http.put(url('/api/v1/category-rules/:id'), async ({ request, params }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const body = (await request.json()) as RuleRequest
      state.requests.push({ method: 'PUT', path: `/api/v1/category-rules/${String(params.id)}`, body })
      const ifMatch = request.headers.get('If-Match')
      state.ifMatches.push(ifMatch)
      const rule = state.rules.find((candidate) => candidate.id === params.id)
      if (!rule) return problem(404)
      if (ifMatch === null) return problem(428)
      if (ifMatch !== `"${rule.rowVersion}"`) return problem(412)
      const wrong = check(body, rule.categoryId)
      if (wrong) return wrong
      Object.assign(rule, { matchText: body.matchText.trim(), matchType: body.matchType, categoryId: body.categoryId, priority: body.priority ?? rule.priority })
      changed(rule)
      return HttpResponse.json(view(rule), { headers: { ETag: `"${rule.rowVersion}"` } })
    }),
    http.delete(url('/api/v1/category-rules/:id'), ({ request, params }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      state.requests.push({ method: 'DELETE', path: `/api/v1/category-rules/${String(params.id)}`, body: null })
      const index = state.rules.findIndex((candidate) => candidate.id === params.id)
      if (index < 0) return problem(404)
      state.rules.splice(index, 1)
      return new HttpResponse(null, { status: 204 })
    }),
  )

  return state
}
