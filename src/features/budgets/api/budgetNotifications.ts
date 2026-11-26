import { infiniteQueryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { components } from '@/shared/api/schema'

export type BudgetNotification = components['schemas']['BudgetNotificationResponse']

/**
 * Under the budgets' key, so whatever loads the budgets again after a change that moves what was spent
 * (`refreshBudgets`) loads the notifications again too: that change is what raises one.
 */
const notificationsKey = ['budgets', 'notifications']

/**
 * The user's budget notifications, the newest first, a page at a time, with how many of all of them are unread
 * (`unread` on every page; the first page's is the one shown). The API raises them; nothing is worked out here.
 */
export const budgetNotificationsQuery = infiniteQueryOptions({
  queryKey: notificationsKey,
  queryFn: async ({ pageParam }) => {
    const { data, response } = await api.GET('/api/v1/budget-notifications', { params: { query: pageParam ? { cursor: pageParam } : {} } })
    if (!data) throw new Error(`Could not load budget notifications: ${response.status}`)
    return data
  },
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (page) => page.nextCursor ?? undefined,
})

/** Marks one notification read, or every one when given none. */
export function useReadBudgetNotifications() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id?: string) => {
      const { response } =
        id === undefined
          ? await api.POST('/api/v1/budget-notifications/read')
          : await api.POST('/api/v1/budget-notifications/{id}/read', { params: { path: { id } } })
      // One the API no longer has needs no reading.
      if (!response.ok && response.status !== 404) throw new Error(`Marking budget notifications read failed: ${response.status}`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationsKey }),
  })
}
