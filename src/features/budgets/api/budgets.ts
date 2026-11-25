import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { refreshReports } from '@/features/reports'
import { refreshProfile } from '@/features/settings'
import { api } from '@/shared/api/client'
import type { components } from '@/shared/api/schema'
import { ifMatch, isStale, versionedSaveOutcome, type VersionedSaveOutcome } from '@/shared/api/versionedSave'
import type { DecimalString } from '@/shared/money'
import type { BudgetMonth } from '../budgetMonth'

export type Budget = components['schemas']['BudgetResponse']
export type BudgetState = components['schemas']['BudgetState']
export type BudgetTotals = components['schemas']['BudgetTotalsResponse']

/** Fields the API can refuse, which the row shows its own translated message for. */
const budgetFields = ['amount', 'categoryId'] as const
export type BudgetField = (typeof budgetFields)[number]

export type SaveOutcome = VersionedSaveOutcome<'budget', Budget, BudgetField>

const budgetsKey = ['budgets']

/**
 * The budgets of one budget month, each against what was spent, with the month's totals. Spent, remaining,
 * the percentage and the state all come from the API; nothing is worked out here.
 */
export const budgetsQuery = (month: BudgetMonth) =>
  queryOptions({
    queryKey: [...budgetsKey, month],
    queryFn: async () => {
      const { data, response } = await api.GET('/api/v1/budgets', { params: { query: { month } } })
      if (!data) throw new Error(`Could not load budgets: ${response.status}`)
      return data
    },
  })

/**
 * Loads the budgets again, for a change made elsewhere that moves what was spent: recording, editing or
 * deleting a transaction.
 */
export function refreshBudgets(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: budgetsKey })
}

/**
 * A category's first budget locks the base currency and its last one leaving unlocks it, which the profile says;
 * budget vs actual sets every budget against what was spent.
 */
function refresh(queryClient: QueryClient) {
  return Promise.all([refreshBudgets(queryClient), refreshProfile(queryClient), refreshReports(queryClient)])
}

/**
 * Sets a category's budget for the month. A change to a budget that exists names the row version it was read
 * at, sent as `If-Match`; a new budget has none. If the budget has changed since (a 412) nothing is saved and
 * the outcome is stale.
 */
export function useSetBudget(month: BudgetMonth) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ categoryId, amount, rowVersion }: { categoryId: string; amount: DecimalString; rowVersion?: string }): Promise<SaveOutcome> =>
      versionedSaveOutcome(
        'budget',
        await api.PUT('/api/v1/budgets/{month}/{categoryId}', {
          params: { path: { month, categoryId }, header: rowVersion === undefined ? {} : { 'If-Match': ifMatch(rowVersion) } },
          body: { amount },
        }),
        budgetFields,
      ),
    // Saved, or stale: either way the month no longer shows what the API holds.
    onSuccess: (outcome) => {
      if (outcome.saved || isStale(outcome)) return refresh(queryClient)
    },
  })
}

/** Removes a category's budget for the month. One already removed somewhere else is as gone as it was asked to be. */
export function useRemoveBudget(month: BudgetMonth) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (categoryId: string) => {
      const { response } = await api.DELETE('/api/v1/budgets/{month}/{categoryId}', { params: { path: { month, categoryId } } })
      if (!response.ok && response.status !== 404) throw new Error(`Removing a budget failed: ${response.status}`)
    },
    onSuccess: () => refresh(queryClient),
  })
}

/**
 * Copies the budgets of another month (last month's, on the budget screen) into the month in one action. The
 * API leaves alone every category that takes no new budget in the month (one already budgeted there, an
 * archived one, one whose parent or subcategory is budgeted there) and answers how many it copied.
 */
export function useCopyBudgets(month: BudgetMonth) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (sourceMonth: BudgetMonth): Promise<{ copied: number }> => {
      const { data, response } = await api.POST('/api/v1/budgets/{month}/copy-from/{sourceMonth}', { params: { path: { month, sourceMonth } } })
      if (!data) throw new Error(`Copying budgets failed: ${response.status}`)
      return { copied: Number(data.copied) }
    },
    onSuccess: () => refresh(queryClient),
  })
}
