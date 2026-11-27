import { useInfiniteQuery } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Drawer } from '@/shared/components/Drawer'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { formatMonth, isCalendarMonth } from '@/shared/dates'
import { useLocale } from '@/shared/i18n/useLocale'
import { cn, focusRing } from '@/shared/lib/utils'
import { formatMoney } from '@/shared/money'
import { Button } from '@/shared/ui/button'
import { budgetNotificationsQuery, useReadAllBudgetNotifications, useReadBudgetNotification, type BudgetNotification } from '../api/budgetNotifications'
import { budgetStates } from './budgetStates'

/**
 * The bell every signed-in screen shows (spec BUD-7): how many budget notifications are unread, and a drawer
 * listing them, the newest first. Choosing one opens its budget month and marks it read.
 */
export function BudgetNotifications() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const notifications = useInfiniteQuery(budgetNotificationsQuery)
  const read = useReadBudgetNotification()
  const readAll = useReadAllBudgetNotifications()
  const unread = Number(notifications.data?.pages[0]?.unread ?? 0)
  const items = notifications.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={unread > 0 ? t('budgets.notifications.buttonUnread', { count: unread }) : t('budgets.notifications.title')}
        className={cn('relative rounded-md p-2 hover:bg-muted', focusRing)}
      >
        <Bell aria-hidden className="size-5" />
        {unread > 0 && (
          <span aria-hidden className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 text-primary-foreground">
            {unread}
          </span>
        )}
      </button>
      <Drawer open={open} onOpenChange={setOpen} title={t('budgets.notifications.title')}>
        <Button variant="outline" disabled={unread === 0 || readAll.isPending} onClick={() => readAll.mutate()}>
          {t('budgets.notifications.readAll')}
        </Button>
        {notifications.isError && <ErrorMessage>{t('budgets.notifications.notLoaded')}</ErrorMessage>}
        {(read.isError || readAll.isError) && <ErrorMessage>{t('budgets.notifications.notRead')}</ErrorMessage>}
        {notifications.data && items.length === 0 && <p className="text-muted-foreground">{t('budgets.notifications.empty')}</p>}
        {items.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {items.map((notification) => (
              <Item
                key={notification.id}
                notification={notification}
                onChoose={() => {
                  setOpen(false)
                  if (notification.readAt === null) read.mutate(notification.id)
                }}
              />
            ))}
          </ul>
        )}
        {notifications.hasNextPage && (
          <Button variant="ghost" disabled={notifications.isFetchingNextPage} onClick={() => void notifications.fetchNextPage()}>
            {t('budgets.notifications.more')}
          </Button>
        )}
      </Drawer>
    </>
  )
}

function Item({ notification, onChoose }: { notification: BudgetNotification; onChoose: () => void }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { icon: Icon, text } = budgetStates[notification.state]
  // The API writes a budget month as 2026-11; anything else is shown as it came rather than misread, and opens the
  // budgets screen on its own month rather than an address it was never meant for.
  const calendarMonth = isCalendarMonth(notification.month) ? notification.month : null
  const month = calendarMonth ? formatMonth(calendarMonth, locale) : notification.month
  const values = { name: notification.category.name, month, percent: notification.percentSpent }
  const unread = notification.readAt === null

  return (
    <li className={cn('p-3', unread && 'bg-muted/50')}>
      <Link to={calendarMonth ? `/budgets/${calendarMonth}` : '/budgets'} onClick={onChoose} className={cn('flex gap-2 rounded-sm', focusRing)}>
        <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', text)} />
        <span className="space-y-0.5">
          <span className={cn('block text-sm', unread && 'font-medium')}>
            {notification.state === 'over' ? t('budgets.notifications.over', values) : t('budgets.notifications.warning', values)}
          </span>
          <span className="block text-sm text-muted-foreground">
            {t('budgets.notifications.spentOf', {
              spent: formatMoney(notification.spent, notification.currency, locale),
              budgeted: formatMoney(notification.budgeted, notification.currency, locale),
            })}
            {notification.percentSpent !== null && ` (${t('budgets.percent', { percent: notification.percentSpent })})`}
          </span>
          {unread && <span className="block text-xs font-medium">{t('budgets.notifications.unread')}</span>}
        </span>
      </Link>
    </li>
  )
}
