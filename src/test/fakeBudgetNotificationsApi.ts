import { http, HttpResponse } from 'msw'
import type { components } from '@/shared/api/schema'
import { apiUrl as url, problem, refuseWithoutToken, server } from './server'

type BudgetNotificationResponse = components['schemas']['BudgetNotificationResponse']
type BudgetNotificationListResponse = components['schemas']['BudgetNotificationListResponse']

/** What a test says of a notification; the rest is filled in. */
export type FakeBudgetNotification = Pick<BudgetNotificationResponse, 'id' | 'month' | 'state' | 'budgeted' | 'spent' | 'percentSpent'> & {
  categoryName: string
  readAt?: string | null
}

/**
 * A stand-in for the API's budget notification endpoints, keeping state across requests and following the same
 * rules as the real API (see the API's BudgetNotificationTests): the newest first, a page at a time, with how
 * many of all of them are unread; reading one already read changes nothing, and one the user has not is a 404.
 * Pass them newest first. `raise` adds one, as a change that moved spent would on the API.
 */
export function fakeBudgetNotificationsApi(notifications: FakeBudgetNotification[] = []) {
  const view = (notification: FakeBudgetNotification): BudgetNotificationResponse => ({
    id: notification.id,
    month: notification.month,
    category: { id: `c-${notification.categoryName}`, parentId: null, name: notification.categoryName, icon: 'tag', color: '#64748b', isArchived: false },
    state: notification.state,
    budgeted: notification.budgeted,
    spent: notification.spent,
    percentSpent: notification.percentSpent,
    currency: 'VND',
    raisedAt: '2026-11-20T08:00:00Z',
    readAt: notification.readAt ?? null,
  })
  const state = {
    notifications: notifications.map(view),
    /** How many times the list was asked for. */
    reads: 0,
    raise(notification: FakeBudgetNotification) {
      state.notifications.unshift(view(notification))
    },
  }
  const now = () => new Date('2026-11-21T09:00:00Z').toISOString()

  server.use(
    http.get(url('/api/v1/budget-notifications'), ({ request }) => {
      state.reads += 1
      const query = new URL(request.url).searchParams
      const limit = Number(query.get('limit') ?? 50)
      const cursor = query.get('cursor')
      const start = cursor === null ? 0 : state.notifications.findIndex((notification) => notification.id === cursor) + 1
      const page = state.notifications.slice(start, start + limit)
      const more = start + limit < state.notifications.length
      return HttpResponse.json({
        items: page,
        nextCursor: more ? page[page.length - 1]!.id : null,
        unread: state.notifications.filter((notification) => notification.readAt === null).length,
      } satisfies BudgetNotificationListResponse)
    }),
    http.post(url('/api/v1/budget-notifications/read'), ({ request }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      for (const notification of state.notifications) notification.readAt ??= now()
      return new HttpResponse(null, { status: 204 })
    }),
    http.post(url('/api/v1/budget-notifications/:id/read'), ({ request, params }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const notification = state.notifications.find((each) => each.id === params.id)
      if (!notification) return problem(404)
      notification.readAt ??= now()
      return new HttpResponse(null, { status: 204 })
    }),
  )

  return state
}
