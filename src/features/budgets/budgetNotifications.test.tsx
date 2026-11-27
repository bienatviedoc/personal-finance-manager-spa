import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeBudgetNotificationsApi, type FakeBudgetNotification } from '@/test/fakeBudgetNotificationsApi'
import { fakeBudgetsApi } from '@/test/fakeBudgetsApi'
import { fakeCategoriesApi } from '@/test/fakeCategoriesApi'
import { fakeProfileApi } from '@/test/fakeProfileApi'
import { renderApp } from '@/test/renderApp'

const transportOver: FakeBudgetNotification = {
  id: 'n-2', month: '2026-11', categoryName: 'Transport', state: 'over', budgeted: '1000000.00', spent: '1050000.00', percentSpent: 105,
}
const shoppingWarning: FakeBudgetNotification = {
  id: 'n-1', month: '2026-10', categoryName: 'Shopping', state: 'warning', budgeted: '2000000.00', spent: '1700000.00', percentSpent: 85,
  readAt: '2026-10-21T08:00:00Z',
}

const open = async (user: ReturnType<typeof renderApp>['user'], name: string | RegExp = /^Budget notifications/) => {
  await user.click(await screen.findByRole('button', { name }))
  return screen.findByRole('dialog', { name: 'Budget notifications' })
}

describe('budget notifications', () => {
  it('say on every screen how many are unread, and list them the newest first, each with what the budget stood at', async () => {
    fakeProfileApi({ locale: 'en' })
    fakeBudgetNotificationsApi([transportOver, shoppingWarning])
    const { user } = renderApp('/settings/profile')

    const dialog = await open(user, 'Budget notifications, 1 unread')

    const items = within(within(dialog).getByRole('list')).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Transport went over its budget for November 2026')
    expect(items[0]).toHaveTextContent('₫1,050,000 spent of ₫1,000,000 (105%)')
    expect(items[0]).toHaveTextContent('Unread')
    expect(items[1]).toHaveTextContent('Shopping reached 85% of its budget for October 2026')
    expect(items[1]).not.toHaveTextContent('Unread')
  })

  it('say what was spent of the budget as one sentence in Vietnamese', async () => {
    fakeProfileApi({ locale: 'vi' })
    fakeBudgetNotificationsApi([transportOver])
    const { user } = renderApp('/settings/profile')

    await user.click(await screen.findByRole('button', { name: /^Thông báo ngân sách/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Thông báo ngân sách' })

    expect(within(dialog).getByRole('listitem')).toHaveTextContent(/Đã chi 1\.050\.000\s₫ trên 1\.000\.000\s₫ \(105\s?%\)/)
  })

  it('open the budget month of the one chosen, and mark it read', async () => {
    fakeProfileApi({ locale: 'en' })
    const categories = fakeCategoriesApi()
    fakeBudgetsApi({ categories: categories.categories })
    const api = fakeBudgetNotificationsApi([transportOver, shoppingWarning])
    const { user, router } = renderApp('/settings/profile')

    const dialog = await open(user)
    await user.click(within(dialog).getByRole('link', { name: /Transport went over its budget/ }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/budgets/2026-11'))
    await waitFor(() => expect(api.notifications[0]!.readAt).not.toBeNull())
    expect(await screen.findByRole('button', { name: 'Budget notifications' })).toBeInTheDocument()
  })

  it('are all marked read at once', async () => {
    fakeProfileApi({ locale: 'en' })
    const api = fakeBudgetNotificationsApi([transportOver, { ...shoppingWarning, readAt: null }])
    const { user } = renderApp('/settings/profile')

    const dialog = await open(user, 'Budget notifications, 2 unread')
    await user.click(within(dialog).getByRole('button', { name: 'Mark all as read' }))

    await waitFor(() => expect(within(dialog).queryByText('Unread')).not.toBeInTheDocument())
    expect(api.notifications.every((notification) => notification.readAt !== null)).toBe(true)
    expect(within(dialog).getByRole('button', { name: 'Mark all as read' })).toBeDisabled()
  })

  it('say when there are none yet', async () => {
    fakeProfileApi({ locale: 'en' })
    const { user } = renderApp('/settings/profile')

    const dialog = await open(user, 'Budget notifications')

    expect(dialog).toHaveTextContent('No budget notifications yet.')
  })

  it('come a page at a time', async () => {
    fakeProfileApi({ locale: 'en' })
    const many = Array.from({ length: 51 }, (_, index): FakeBudgetNotification => ({
      ...shoppingWarning, id: `n-${String(100 - index).padStart(3, '0')}`, categoryName: `Category ${index + 1}`,
    }))
    fakeBudgetNotificationsApi(many)
    const { user } = renderApp('/settings/profile')

    const dialog = await open(user)
    const list = within(dialog).getByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(50)

    await user.click(within(dialog).getByRole('button', { name: 'Show more' }))

    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(51))
    expect(within(dialog).queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument()
  })

  it('are loaded again after a change that moves what was spent', async () => {
    const profile = fakeProfileApi({ locale: 'en' })
    const categories = fakeCategoriesApi()
    fakeBudgetsApi({ profile, categories: categories.categories, spending: { '2026-11': { 'c-transport': { spent: '1050000' } } } })
    const api = fakeBudgetNotificationsApi()
    const { user } = renderApp('/budgets/2026-11')

    const transport = within(await screen.findByRole('list', { name: 'Budgets by category' })).getByRole('listitem', { name: 'Transport' })
    await screen.findByRole('button', { name: 'Budget notifications' })
    api.raise(transportOver)
    await user.type(within(transport).getByRole('textbox', { name: 'Budget for Transport' }), '1000000')
    await user.click(within(transport).getByRole('button', { name: 'Save the budget for Transport' }))

    expect(await screen.findByRole('button', { name: 'Budget notifications, 1 unread' })).toBeInTheDocument()
  })
})
