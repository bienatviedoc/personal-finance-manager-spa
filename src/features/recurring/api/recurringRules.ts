import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { refusedFields } from '@/shared/api/refusedFields'
import type { components } from '@/shared/api/schema'

export type RecurringRule = components['schemas']['RecurringRuleResponse']
export type RecurringFrequency = components['schemas']['RecurringFrequency']

/** What a recurring rule can be: income or an expense, never a transfer. In the order the toggle shows them. */
export const recurringRuleTypes = ['expense', 'income'] as const
export type RecurringRuleType = (typeof recurringRuleTypes)[number]

/** Every frequency, in the order the picker shows them. One the API adds and this list lacks fails typecheck. */
export const recurringFrequencies = ['weekly', 'monthly', 'yearly', 'everyNDays'] as const satisfies readonly RecurringFrequency[]

type MissingFrequency = Exclude<RecurringFrequency, (typeof recurringFrequencies)[number]>
export const everyFrequencyListed: MissingFrequency extends never ? true : MissingFrequency = true

/**
 * What setting up or editing a rule sends. The API takes the type and frequency as text, to name them when
 * refusing them; the SPA only ever sends ones it knows. `interval` is the days between occurrences, for
 * `everyNDays` only.
 */
export type RecurringRuleFields = Omit<components['schemas']['RecurringRuleRequest'], 'type' | 'frequency' | 'interval'> & {
  type: RecurringRuleType
  frequency: RecurringFrequency
  interval: number | null
}

/** Fields the API can refuse, which the form shows its own translated message for. */
const recurringRuleFields = ['type', 'accountId', 'amount', 'categoryId', 'payee', 'note', 'frequency', 'interval', 'startDate', 'endDate'] as const
export type RecurringRuleField = (typeof recurringRuleFields)[number]

export type SaveOutcome = { saved: true; rule: RecurringRule } | { saved: false; fields: RecurringRuleField[] }

const recurringRulesKey = ['recurring-rules']

/** The user's recurring rules, the last set up first. A user has dozens, so every page is loaded. */
export const recurringRulesQuery = queryOptions({
  queryKey: recurringRulesKey,
  queryFn: async () => {
    const rules: RecurringRule[] = []
    let cursor: string | undefined
    do {
      const { data, response } = await api.GET('/api/v1/recurring-rules', { params: { query: { cursor } } })
      if (!data) throw new Error(`Could not load recurring rules: ${response.status}`)
      rules.push(...data.items)
      cursor = data.nextCursor ?? undefined
    } while (cursor)
    return rules
  },
})

/** Sets up a recurring rule. The API's worker records each occurrence on its due date. */
export function useCreateRecurringRule() {
  return useSaveRecurringRule(async (body: RecurringRuleFields) => api.POST('/api/v1/recurring-rules', { body }))
}

/** Replaces what a rule's next transactions say and when they are due. What it already recorded stays as it is. */
export function useEditRecurringRule(id: string) {
  return useSaveRecurringRule(async (body: RecurringRuleFields) => api.PUT('/api/v1/recurring-rules/{id}', { params: { path: { id } }, body }))
}

/** Pauses a rule: it records nothing until it is resumed. */
export function usePauseRecurringRule() {
  return useChangeRecurringRule('Pausing', async (id: string) => api.POST('/api/v1/recurring-rules/{id}/pause', { params: { path: { id } } }))
}

/** Resumes a paused rule: it records again from today, skipping what was due meanwhile. */
export function useResumeRecurringRule() {
  return useChangeRecurringRule('Resuming', async (id: string) => api.POST('/api/v1/recurring-rules/{id}/resume', { params: { path: { id } } }))
}

/** Deletes a rule: it records nothing more, and the transactions it recorded stay. */
export function useDeleteRecurringRule() {
  return useChangeRecurringRule('Deleting', async (id: string) => {
    const { response } = await api.DELETE('/api/v1/recurring-rules/{id}', { params: { path: { id } } })
    // Not found: deleted already, which is what was asked for.
    return { response: response.status === 404 ? new Response(null, { status: 204 }) : response }
  })
}

type SaveResponse = { data?: RecurringRule; error?: unknown; response: Response }

function useSaveRecurringRule(save: (fields: RecurringRuleFields) => Promise<SaveResponse>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (fields: RecurringRuleFields): Promise<SaveOutcome> => {
      const { data, error, response } = await save(fields)
      if (data) return { saved: true, rule: data }
      const refused = refusedFields(response, error, recurringRuleFields)
      if (refused) return { saved: false, fields: refused }
      throw new Error(`Saving a recurring rule failed: ${response.status}`)
    },
    onSuccess: (outcome) => {
      if (outcome.saved) return queryClient.invalidateQueries({ queryKey: recurringRulesKey })
    },
  })
}

/** A change to one rule that sends nothing but which rule: the list is loaded again once it is made. */
function useChangeRecurringRule(doing: string, change: (id: string) => Promise<{ response: Response }>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { response } = await change(id)
      if (!response.ok) throw new Error(`${doing} a recurring rule failed: ${response.status}`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: recurringRulesKey }),
  })
}
