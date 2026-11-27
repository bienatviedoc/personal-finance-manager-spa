import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { refusedFields } from '@/shared/api/refusedFields'
import type { components } from '@/shared/api/schema'

/** One of the user's categorisation rules (see the glossary). */
export type Rule = components['schemas']['CategorisationRuleResponse']
export type MatchType = components['schemas']['CategorisationMatch']
/** Every match type, in the order the form offers them. */
export const matchTypes = ['contains', 'startsWith', 'exactly'] as const satisfies readonly MatchType[]

/** What setting up or editing a rule sends. A priority left out puts a new rule above every other, and keeps an edited one's. */
export type RuleFields = { matchText: string; matchType: MatchType; categoryId: string; priority: number | null }

/** Fields the API can refuse, which the form shows its own translated message for. */
const ruleFields = ['matchText', 'matchType', 'categoryId', 'priority'] as const
export type RuleField = (typeof ruleFields)[number]

export type SaveOutcome = { saved: true; rule: Rule } | { saved: false; fields: RuleField[] }

const rulesKey = ['category-rules']

/** Every one of the user's rules, in the order they are tried: highest priority first. */
export const rulesQuery = queryOptions({
  queryKey: rulesKey,
  queryFn: async () => {
    const { data, response } = await api.GET('/api/v1/category-rules')
    if (!data) throw new Error(`Could not load the rules: ${response.status}`)
    return data.items
  },
})

/** Sets up a rule. */
export function useCreateRule() {
  return useSaveRule(async (body: RuleFields) => api.POST('/api/v1/category-rules', { body }))
}

/** Changes a rule's match text, match type, category and priority. */
export function useEditRule() {
  return useSaveRule(async ({ id, ...body }: RuleFields & { id: string }) => api.PUT('/api/v1/category-rules/{id}', { params: { path: { id } }, body }))
}

/** Deletes a rule: it categorises nothing more. */
export function useDeleteRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { response } = await api.DELETE('/api/v1/category-rules/{id}', { params: { path: { id } } })
      if (!response.ok) throw new Error(`Deleting a rule failed: ${response.status}`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rulesKey }),
  })
}

/**
 * Puts the rules in a new order, every one of them, the one to try first first: each takes its priority from its
 * place. A list the API refuses (a rule added or deleted elsewhere meanwhile) loads the rules again.
 */
export function useReorderRules() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, response } = await api.PUT('/api/v1/category-rules/order', { body: { ids } })
      if (response.status === 400) return
      if (!data) throw new Error(`Reordering the rules failed: ${response.status}`)
      queryClient.setQueryData(rulesKey, data.items)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: rulesKey }),
  })
}

type SaveResponse = { data?: Rule; error?: unknown; response: Response }

function useSaveRule<Variables>(save: (variables: Variables) => Promise<SaveResponse>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (variables: Variables): Promise<SaveOutcome> => {
      const { data, error, response } = await save(variables)
      if (data) return { saved: true, rule: data }
      const fields = refusedFields(response, error, ruleFields)
      if (fields) return { saved: false, fields }
      throw new Error(`Saving a rule failed: ${response.status}`)
    },
    onSuccess: (outcome) => {
      if (outcome.saved) return queryClient.invalidateQueries({ queryKey: rulesKey })
    },
  })
}
