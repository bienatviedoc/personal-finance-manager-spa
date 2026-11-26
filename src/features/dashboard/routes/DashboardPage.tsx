import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { cn, focusRing } from '@/shared/lib/utils'
import { buttonVariants } from '@/shared/ui/button'
import { dashboardQuery } from '../api/dashboard'
import { BalanceCard, BudgetsCard, RecentTransactionsCard, ThisMonthCard, TopCategoriesCard, UpcomingCard } from '../components/DashboardCards'

/**
 * The dashboard (spec RPT-1, section 12): the state of the user's money on one screen, from one request. Each card
 * links to the screen or report behind it. A new user with no account yet is shown where to start instead.
 */
export function DashboardPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('screens.dashboard'))
  const dashboard = useQuery(dashboardQuery())

  return (
    <section className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold">{t('screens.dashboard')}</h1>

      {dashboard.isPending && <DashboardSkeleton />}
      {dashboard.isError && <ErrorMessage>{t('dashboard.errors.notLoaded')}</ErrorMessage>}

      {dashboard.data &&
        (dashboard.data.hasAccounts ? (
          <div className="grid gap-4 md:grid-cols-2">
            <BalanceCard dashboard={dashboard.data} />
            <ThisMonthCard dashboard={dashboard.data} />
            <BudgetsCard dashboard={dashboard.data} />
            <TopCategoriesCard dashboard={dashboard.data} />
            <RecentTransactionsCard dashboard={dashboard.data} />
            <UpcomingCard dashboard={dashboard.data} />
          </div>
        ) : (
          <div className="max-w-xl space-y-3 rounded-lg border p-6">
            <h2 className="text-lg font-semibold">{t('dashboard.start.title')}</h2>
            <p className="text-muted-foreground">{t('dashboard.start.body')}</p>
            <Link to="/accounts" className={cn(buttonVariants(), focusRing)}>
              {t('dashboard.start.action')}
            </Link>
          </div>
        ))}
    </section>
  )
}

/** Whether each card is as wide as the dashboard, in the order they are shown: the latest transactions and what is coming up are. */
const wideCards = [false, false, false, false, true, true]

/** A card standing in for each of the dashboard's while it loads, laid out as they are. */
function DashboardSkeleton() {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy aria-label={t('dashboard.loading')} className="grid gap-4 md:grid-cols-2">
      {wideCards.map((wide, card) => (
        <div key={card} className={cn('space-y-3 rounded-lg border p-4', wide && 'md:col-span-2')}>
          <span className="block h-4 w-24 animate-pulse rounded bg-muted" />
          <span className="block h-8 w-40 animate-pulse rounded bg-muted" />
          <span className="block h-4 w-full animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}
