import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { refreshTransactions } from '@/features/transactions'
import { api } from '@/shared/api/client'
import { refusedFields } from '@/shared/api/refusedFields'
import { ifMatch, versionedSaveOutcome, type VersionedSaveOutcome, type VersionedSaveResponse } from '@/shared/api/versionedSave'
import type { components } from '@/shared/api/schema'

export type RecurringRule = components['schemas']['RecurringRuleResponse']
export type RecurringFrequency = components['schemas']['RecurringFrequency']
export type RecurringMode = components['schemas']['RecurringMode']
/** One occurrence of a rule: a reminder, or one due in the days ahead. */
export type Occurrence = components['schemas']['OccurrenceResponse']

/** What a recurring rule can be: income or an expense, never a transfer. In the order the toggle shows them. */
export const recurringRuleTypes = ['expense', 'income'] as const
export type RecurringRuleType = (typeof recurringRuleTypes)[number]

/** Every frequency, in the order the picker shows them. One the API adds and this list lacks fails typecheck. */
export const recurringFrequencies = ['weekly', 'monthly', 'yearly', 'everyNDays'] as const satisfies readonly RecurringFrequency[]

/** Every mode, in the order the picker shows them: the worker records each occurrence, or each is a reminder the user confirms. */
export const recurringModes = ['autoPost', 'remind'] as const satisfies readonly RecurringMode[]

type MissingMode = Exclude<RecurringMode, (typeof recurringModes)[number]>
export const everyModeListed: MissingMode extends never ? true : MissingMode = true

type MissingFrequency = Exclude<RecurringFrequency, (typeof recurringFrequencies)[number]>
export const everyFrequencyListed: MissingFrequency extends never ? true : MissingFrequency = true

/**
 * What setting up or editing a rule sends. The API takes the type and frequency as text, to name them when
 * refusing them; the SPA only ever sends ones it knows. `interval` is the days between occurrences, for
 * `everyNDays` only. `mode` says whether each occurrence is recorded on its due date or is a reminder.
 */
export type RecurringRuleFields = Omit<components['schemas']['RecurringRuleRequest'], 'type' | 'frequency' | 'interval' | 'mode'> & {
  type: RecurringRuleType
  frequency: RecurringFrequency
  interval: number | null
  mode: RecurringMode
}

/** Fields the API can refuse, which the form shows its own translated message for. */
const recurringRuleFields = ['type', 'accountId', 'amount', 'categoryId', 'payee', 'note', 'frequency', 'interval', 'startDate', 'endDate', 'mode'] as const
export type RecurringRuleField = (typeof recurringRuleFields)[number]

export type SaveOutcome = VersionedSaveOutcome<'rule', RecurringRule, RecurringRuleField>

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

/** The user's reminders: each occurrence of a rule that reminds, due by today and not confirmed or dismissed yet, earliest first. */
export const remindersQuery = queryOptions({
  queryKey: [...recurringRulesKey, 'reminders'],
  queryFn: async () => {
    const { data, response } = await api.GET('/api/v1/recurring-rules/reminders')
    if (!data) throw new Error(`Could not load reminders: ${response.status}`)
    return data.items
  },
})

/** How many days ahead the upcoming list looks (spec REC-3). */
export const upcomingDays = 30

/**
 * Every occurrence of the user's rules due after today and within `days` days, earliest first, whether it
 * will be recorded or be a reminder. A paused rule has none.
 */
export const upcomingQuery = (days: number = upcomingDays) =>
  queryOptions({
    queryKey: [...recurringRulesKey, 'upcoming', days],
    queryFn: async () => {
      const { data, response } = await api.GET('/api/v1/recurring-rules/upcoming', { params: { query: { days } } })
      if (!data) throw new Error(`Could not load the upcoming occurrences: ${response.status}`)
      return data.items
    },
  })

/** Fields answering a reminder can be refused on: the amount, or the due date when an earlier reminder of the rule is waiting. */
const reminderFields = ['amount', 'dueDate'] as const
export type ReminderField = (typeof reminderFields)[number]

export type ReminderOutcome = { saved: true; rule: RecurringRule } | { saved: false; fields: ReminderField[] }

type Reminder = Pick<Occurrence, 'recurringRuleId' | 'dueDate'>

/**
 * Confirms a reminder: its transaction is recorded on its due date, for `amount` when the user entered
 * another one and for the rule's own otherwise, and the rule moves on.
 */
export function useConfirmReminder() {
  const queryClient = useQueryClient()
  return useAnswerReminder('Confirming', async ({ recurringRuleId, dueDate, amount }: Reminder & { amount?: string }) =>
    api.POST('/api/v1/recurring-rules/{id}/reminders/{dueDate}/confirm', {
      params: { path: { id: recurringRuleId, dueDate } },
      body: amount === undefined ? {} : { amount },
    }),
  // A transaction was recorded: what shows transactions, balances, budgets and reports is out of date.
  () => refreshTransactions(queryClient),
  )
}

/** Dismisses a reminder: nothing is recorded for it, and the rule moves on. */
export function useDismissReminder() {
  return useAnswerReminder('Dismissing', async ({ recurringRuleId, dueDate }: Reminder) =>
    api.POST('/api/v1/recurring-rules/{id}/reminders/{dueDate}/dismiss', { params: { path: { id: recurringRuleId, dueDate } } }),
  )
}

function useAnswerReminder<Variables>(
  changeName: string,
  answer: (variables: Variables) => Promise<{ data?: RecurringRule; error?: unknown; response: Response }>,
  alsoRefresh?: () => Promise<unknown>,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (variables: Variables): Promise<ReminderOutcome> => {
      const { data, error, response } = await answer(variables)
      if (data) return { saved: true, rule: data }
      const fields = refusedFields(response, error, reminderFields)
      if (fields) return { saved: false, fields }
      throw new Error(`${changeName} a reminder failed: ${response.status}`)
    },
    // The rules, their reminders and what is upcoming are loaded again: the rule moved on.
    onSuccess: (outcome) => {
      if (outcome.saved) return Promise.all([queryClient.invalidateQueries({ queryKey: recurringRulesKey }), alsoRefresh?.()])
    },
  })
}

/** Sets up a recurring rule. The API's worker records each occurrence on its due date. */
export function useCreateRecurringRule() {
  return useSaveRecurringRule(async (body: RecurringRuleFields) => api.POST('/api/v1/recurring-rules', { body }))
}

/**
 * Replaces what a rule's next transactions say and when they are due, from the row version it was read at,
 * sent as `If-Match`. What it already recorded stays as it is. If the rule has changed since (a 412: edited,
 * paused or resumed somewhere else, or an occurrence recorded) nothing is saved and the outcome is stale.
 */
export function useEditRecurringRule({ id, rowVersion }: Pick<RecurringRule, 'id' | 'rowVersion'>) {
  return useSaveRecurringRule(async (body: RecurringRuleFields) =>
    api.PUT('/api/v1/recurring-rules/{id}', { params: { path: { id }, header: { 'If-Match': ifMatch(rowVersion) } }, body }),
  )
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

function useSaveRecurringRule(save: (fields: RecurringRuleFields) => Promise<VersionedSaveResponse<RecurringRule>>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (fields: RecurringRuleFields): Promise<SaveOutcome> => versionedSaveOutcome('rule', await save(fields), recurringRuleFields),
    // Saved, the list shows the change; stale, it loads the rule as it is now, to edit from.
    onSuccess: (outcome) => {
      if (outcome.saved || 'stale' in outcome) return queryClient.invalidateQueries({ queryKey: recurringRulesKey })
    },
  })
}

/** A change to one rule that sends nothing but which rule: the list is loaded again once it is made. `changeName` ("Pausing") names it in the error. */
function useChangeRecurringRule(changeName: string, change: (id: string) => Promise<{ response: Response }>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { response } = await change(id)
      if (!response.ok) throw new Error(`${changeName} a recurring rule failed: ${response.status}`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: recurringRulesKey }),
  })
}
