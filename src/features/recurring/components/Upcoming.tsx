import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { findCategory, kindTakenBy, type Category } from '@/features/categories'
import { formatDate } from '@/shared/dates'
import { useLocale } from '@/shared/i18n/useLocale'
import { Money, signedAmount } from '@/shared/money'
import { upcomingDays, type Occurrence } from '../api/recurringRules'
import { occurrenceTitle } from './occurrenceTitle'

type Props = { occurrences: Occurrence[]; categories: Category[] }

/**
 * Every occurrence of the user's rules due in the next 30 days, earliest first: what will be recorded for
 * them, and what will be a reminder for them to confirm. The API works out every date.
 */
export function Upcoming({ occurrences, categories }: Props) {
  const { t } = useTranslation()
  const locale = useLocale()
  const headingId = useId()

  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h2 id={headingId} className="text-lg font-semibold">
        {t('recurring.upcoming', { days: upcomingDays })}
      </h2>
      {occurrences.length === 0 ? (
        <p className="text-muted-foreground">{t('recurring.upcomingEmpty', { days: upcomingDays })}</p>
      ) : (
        <ul aria-label={t('recurring.upcomingList', { days: upcomingDays })} className="divide-y rounded-lg border">
          {occurrences.map((occurrence) => {
            // A rule is only ever income or an expense.
            const type = kindTakenBy(occurrence.type)
            return (
              <li key={`${occurrence.recurringRuleId}:${occurrence.dueDate}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
                <span data-testid="due" className="w-28 text-sm text-muted-foreground tabular-nums">
                  {formatDate(occurrence.dueDate, locale)}
                </span>
                <div className="min-w-24 flex-1">
                  <h3 className="font-medium break-words">{occurrenceTitle(occurrence, findCategory(categories, occurrence.categoryId), t(`recurring.types.${type}`))}</h3>
                  <p data-testid="what" className="text-sm text-muted-foreground">
                    {t(`recurring.occurrenceModes.${occurrence.mode}`)}
                  </p>
                </div>
                <span data-testid="amount" className="font-medium tabular-nums">
                  <Money amount={signedAmount(occurrence.amount, type === 'expense')} currency={occurrence.currency} />
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
