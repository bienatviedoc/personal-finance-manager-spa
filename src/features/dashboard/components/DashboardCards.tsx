import type { ParseKeys } from 'i18next'
import { useTranslation } from 'react-i18next'
import { budgetStates } from '@/features/budgets'
import { takesFromBalance, titleOf } from '@/features/transactions'
import { formatDate } from '@/shared/dates'
import { useLocale } from '@/shared/i18n/useLocale'
import { joinDetails } from '@/shared/lib/details'
import { formatShare } from '@/shared/lib/formatShare'
import { cn } from '@/shared/lib/utils'
import { formatMoney, inCurrencyOrder, Money, signedAmount, type Currency } from '@/shared/money'
import type { Dashboard, DashboardOccurrence } from '../api/dashboard'
import { Card } from './Card'

/** Where the screens and reports behind the cards are. A report is of this month: a preset the reports screen works out again on the day it is opened. */
const screens = {
  accounts: '/accounts',
  incomeVsExpenses: '/reports/income-vs-expenses?period=thisMonth',
  budgets: '/budgets',
  spendingByCategory: '/reports/spending-by-category?period=thisMonth',
  transactions: '/transactions',
  recurring: '/recurring',
}

/** What every account that is not archived holds, in the base currency, with what is left out for want of a rate. */
export function BalanceCard({ dashboard }: { dashboard: Dashboard }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { balance, notConverted } = dashboard.balance
  return (
    <Card title={t('dashboard.balance.title')} to={screens.accounts} linkLabel={t('dashboard.balance.link')}>
      <p className="text-3xl font-semibold tabular-nums">
        <Money amount={balance} currency={dashboard.currency} />
      </p>
      {notConverted.length > 0 && (
        <p role="note" className="text-sm font-medium text-warning">
          {t('dashboard.balance.notConverted', {
            // A list the locale's way: a comma between amounts would read as a decimal comma in Vietnamese.
            amounts: new Intl.ListFormat(locale, { type: 'conjunction' }).format(
              notConverted.toSorted(inCurrencyOrder).map((amount) => formatMoney(amount.balance, amount.currency, locale)),
            ),
          })}
        </p>
      )}
    </Card>
  )
}

/** This month's income, expenses and net, as income vs expenses works them out. */
export function ThisMonthCard({ dashboard }: { dashboard: Dashboard }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { thisMonth, currency } = dashboard
  const figures: [ParseKeys, string][] = [
    ['dashboard.thisMonth.income', thisMonth.income],
    ['dashboard.thisMonth.expenses', thisMonth.expenses],
    ['dashboard.thisMonth.net', thisMonth.net],
  ]
  return (
    <Card title={t('dashboard.thisMonth.title')} to={screens.incomeVsExpenses} linkLabel={t('dashboard.thisMonth.link')}>
      <dl className="grid grid-cols-3 gap-2">
        {figures.map(([label, amount]) => (
          <div key={label}>
            <dt className="text-sm text-muted-foreground">{t(label)}</dt>
            <dd className="font-semibold tabular-nums">
              <Money amount={amount} currency={currency} />
            </dd>
          </div>
        ))}
      </dl>
      {thisMonth.savingsRate !== null && <p className="text-sm text-muted-foreground">{t('dashboard.thisMonth.savingsRate', { rate: formatShare(thisMonth.savingsRate, locale) })}</p>}
      {Number(thisMonth.notConverted) > 0 && (
        <p role="note" className="text-sm font-medium text-warning">
          {t('reports.notConverted', { count: Number(thisMonth.notConverted) })}
        </p>
      )}
    </Card>
  )
}

/**
 * This month's budgets added up, how many are in each state, and the ones over or at warning. A state is said in
 * words beside an icon of its own shape, never by colour alone.
 */
export function BudgetsCard({ dashboard }: { dashboard: Dashboard }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { budgets, currency } = dashboard
  if (!budgets) {
    return (
      <Card title={t('dashboard.budgets.title')} to={screens.budgets} linkLabel={t('dashboard.budgets.set')}>
        <p className="text-muted-foreground">{t('dashboard.budgets.none')}</p>
      </Card>
    )
  }

  // A percentage is a count, not money.
  const percent = budgets.percentSpent === null ? null : Number(budgets.percentSpent)
  const [over, warning, onTrack, notConverted] = [budgets.over, budgets.warning, budgets.onTrack, budgets.notConverted].map(Number) as [number, number, number, number]
  const filled = percent === null ? 0 : Math.min(100, Math.max(0, percent))
  const worst = over > 0 ? budgetStates.over : warning > 0 ? budgetStates.warning : budgetStates.onTrack
  return (
    <Card title={t('dashboard.budgets.title')} to={screens.budgets} linkLabel={t('dashboard.budgets.link')}>
      <p className="tabular-nums">
        {t('dashboard.budgets.spentOf', { spent: formatMoney(budgets.spent, currency, locale), budgeted: formatMoney(budgets.budgeted, currency, locale) })}
      </p>
      {percent !== null && (
        <div className="flex items-center gap-2">
          <div
            role="progressbar"
            aria-label={t('dashboard.budgets.progress', { percent })}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={filled}
            className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
          >
            <div className={cn('h-full rounded-full', worst.bar)} style={{ width: `${filled}%` }} />
          </div>
          <span className="text-sm tabular-nums text-muted-foreground">{t('budgets.percent', { percent })}</span>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        {t('dashboard.budgets.counts', { onTrack, warning, over })}
      </p>
      {budgets.needingAttention.length > 0 && (
        <ul aria-label={t('dashboard.budgets.needingAttention')} className="space-y-1">
          {budgets.needingAttention.map((budget) => {
            const { label, icon: Icon, text } = budgetStates[budget.state]
            return (
              <li key={budget.category.id} className="flex flex-wrap items-center gap-x-2 text-sm">
                <span className="flex-1 font-medium">{budget.category.name}</span>
                <span className={cn('inline-flex items-center gap-1 font-medium', text)}>
                  <Icon aria-hidden className="size-4" />
                  {t(label)}
                </span>
                {budget.percentSpent !== null && <span className="w-12 text-right tabular-nums">{t('budgets.percent', { percent: Number(budget.percentSpent) })}</span>}
              </li>
            )
          })}
        </ul>
      )}
      {notConverted > 0 && (
        <p role="note" className="text-sm font-medium text-warning">
          {t('budgets.notConverted', { count: notConverted })}
        </p>
      )}
    </Card>
  )
}

/** The top-level categories that spent most this month, each with its share as a small bar. */
export function TopCategoriesCard({ dashboard }: { dashboard: Dashboard }) {
  const { t } = useTranslation()
  const locale = useLocale()
  return (
    <Card title={t('dashboard.topCategories.title')} to={screens.spendingByCategory} linkLabel={t('dashboard.topCategories.link')}>
      {dashboard.topCategories.length === 0 ? (
        <p className="text-muted-foreground">{t('dashboard.topCategories.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {dashboard.topCategories.map((item) => (
            <li key={item.category.id} className="space-y-1">
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="flex-1 font-medium">{item.category.name}</span>
                <span className="tabular-nums">
                  <Money amount={item.spent} currency={dashboard.currency} />
                </span>
                {/* A share is a percentage of the total, not money. */}
                {item.share !== null && <span className="w-14 text-right tabular-nums text-muted-foreground">{formatShare(item.share, locale)}</span>}
              </div>
              <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, Number(item.share ?? 0)))}%`, backgroundColor: item.category.color }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/** The latest transactions, newest first, each with its amount signed as the transaction list signs it. */
export function RecentTransactionsCard({ dashboard }: { dashboard: Dashboard }) {
  const { t } = useTranslation()
  const locale = useLocale()
  return (
    <Card title={t('dashboard.recent.title')} to={screens.transactions} linkLabel={t('dashboard.recent.link')} className="md:col-span-2">
      {dashboard.recentTransactions.length === 0 ? (
        <p className="text-muted-foreground">{t('dashboard.recent.empty')}</p>
      ) : (
        <ul className="divide-y">
          {dashboard.recentTransactions.map((transaction) => (
            <Row
              key={transaction.id}
              title={titleOf({ ...transaction, categoryName: transaction.category?.name }, t)}
              details={joinDetails([
                formatDate(transaction.date, locale),
                transaction.account.name,
                transaction.isRefund ? t('dashboard.recent.refund') : undefined,
              ])}
              amount={signedAmount(transaction.amount, takesFromBalance(transaction))}
              currency={transaction.currency}
            />
          ))}
        </ul>
      )}
    </Card>
  )
}

/** What recurring rules will record, or remind about, in the next 30 days. */
export function UpcomingCard({ dashboard }: { dashboard: Dashboard }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const modeOf = (occurrence: DashboardOccurrence) => t(occurrence.isReminder ? 'recurring.occurrenceModes.remind' : 'recurring.occurrenceModes.autoPost')
  return (
    <Card title={t('dashboard.upcoming.title')} to={screens.recurring} linkLabel={t('dashboard.upcoming.link')} className="md:col-span-2">
      {dashboard.upcoming.length === 0 ? (
        <p className="text-muted-foreground">{t('dashboard.upcoming.empty')}</p>
      ) : (
        <ul className="divide-y">
          {dashboard.upcoming.map((occurrence) => (
            <Row
              key={`${occurrence.recurringRuleId}:${occurrence.dueDate}`}
              title={occurrence.payee ?? occurrence.category.name}
              details={joinDetails([formatDate(occurrence.dueDate, locale), occurrence.account.name, modeOf(occurrence)])}
              amount={signedAmount(occurrence.amount, occurrence.type === 'expense')}
              currency={occurrence.currency}
            />
          ))}
        </ul>
      )}
    </Card>
  )
}

function Row({ title, details, amount, currency }: { title: string; details: string; amount: string; currency: Currency }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <div className="min-w-24 flex-1">
        <p data-testid="title" className="font-medium break-words">
          {title}
        </p>
        <p className="text-sm text-muted-foreground">{details}</p>
      </div>
      <span data-testid="amount" className="font-medium tabular-nums">
        <Money amount={amount} currency={currency} />
      </span>
    </li>
  )
}
