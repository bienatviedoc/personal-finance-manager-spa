import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { components } from '@/shared/api/schema'
import { ifMatch, versionedSaveOutcome, type VersionedSaveOutcome, type VersionedSaveResponse } from '@/shared/api/versionedSave'

/** One of the user's categorisation rules (see the glossary). */
export type CategorisationRule = components['schemas']['CategorisationRuleResponse']
export type MatchType = components['schemas']['CategorisationMatch']
/** Every match type, in the order the form offers them. */
export const matchTypes = ['contains', 'startsWith', 'exactly'] as const satisfies readonly MatchType[]

/** What setting up or editing a rule sends. A priority left out puts a new rule above every other, and keeps an edited one's. */
export type CategorisationRuleFields = { matchText: string; matchType: MatchType; categoryId: string; priority: number | null }

/** Fields the API can refuse, which the form shows its own translated message for. */
const categorisationRuleFields = ['matchText', 'matchType', 'categoryId', 'priority'] as const
export type CategorisationRuleField = (typeof categorisationRuleFields)[number]

export type SaveOutcome = VersionedSaveOutcome<'rule', CategorisationRule, CategorisationRuleField>

const categorisationRulesKey = ['category-rules']

/** Every one of the user's rules, in the order they are tried: highest priority first. */
export const categorisationRulesQuery = queryOptions({
  queryKey: categorisationRulesKey,
  queryFn: async () => {
    const { data, response } = await api.GET('/api/v1/category-rules')
    if (!data) throw new Error(`Could not load the rules: ${response.status}`)
    return data.items
  },
})

/** Sets up a rule. */
export function useCreateCategorisationRule() {
  return useSaveCategorisationRule(async (body: CategorisationRuleFields) => api.POST('/api/v1/category-rules', { body }))
}

/**
 * Changes a rule's match text, match type, category and priority, from the row version it was read at, sent as
 * `If-Match`. If the rule has changed since (a 412: edited or reordered somewhere else, or its category merged)
 * nothing is saved and the outcome is stale.
 */
export function useEditCategorisationRule({ id, rowVersion }: Pick<CategorisationRule, 'id' | 'rowVersion'>) {
  return useSaveCategorisationRule(async (body: CategorisationRuleFields) =>
    api.PUT('/api/v1/category-rules/{id}', { params: { path: { id }, header: { 'If-Match': ifMatch(rowVersion) } }, body }),
  )
}

/** Deletes a rule: it categorises nothing more. */
export function useDeleteCategorisationRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { response } = await api.DELETE('/api/v1/category-rules/{id}', { params: { path: { id } } })
      if (!response.ok) throw new Error(`Deleting a rule failed: ${response.status}`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: categorisationRulesKey }),
  })
}

/**
 * Puts the rules in a new order, every one of them, the one to try first first, each with the row version it was
 * read at: each takes its priority from its place. If the rules have changed since (a 412: one set up, edited or
 * deleted somewhere else) nothing is moved and the outcome is stale; either way the rules load again.
 */
export function useReorderCategorisationRules() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (rules: Pick<CategorisationRule, 'id' | 'rowVersion'>[]): Promise<{ reordered: boolean }> => {
      const body = { rules: rules.map(({ id, rowVersion }) => ({ id, rowVersion })) }
      const { data, response } = await api.PUT('/api/v1/category-rules/order', { body })
      if (response.status === 412) return { reordered: false }
      if (!data) throw new Error(`Reordering the rules failed: ${response.status}`)
      queryClient.setQueryData(categorisationRulesKey, data.items)
      return { reordered: true }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: categorisationRulesKey }),
  })
}

function useSaveCategorisationRule(save: (fields: CategorisationRuleFields) => Promise<VersionedSaveResponse<CategorisationRule>>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (fields: CategorisationRuleFields): Promise<SaveOutcome> => versionedSaveOutcome('rule', await save(fields), categorisationRuleFields),
    // Saved, the list shows the change; stale, it loads the rule as it is now, to edit from.
    onSuccess: (outcome) => {
      if (outcome.saved || 'stale' in outcome) return queryClient.invalidateQueries({ queryKey: categorisationRulesKey })
    },
  })
}
