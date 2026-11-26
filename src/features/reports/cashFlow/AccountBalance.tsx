import { useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import type { CalendarDate } from '@/shared/dates'
import { cn, focusRingWithin } from '@/shared/lib/utils'
import { cashFlowQuery } from '../api/cashFlow'
import type { ReportView } from '../frame/useReportFilters'
import { ReportLoading } from '../frame/ReportLoading'
import { BalanceLine } from './BalanceLine'
import { CashFlowTable } from './CashFlowReport'

type Props = {
  accountId: string
  from: CalendarDate
  to: CalendarDate
  /** What the chart shows, read out in place of the drawing. */
  label: string
}

/**
 * One account's running balance at the end of every day of a period, in its own currency (spec RPT-4), as a line
 * or as a table of the same numbers: the balance chart of the account detail page. Loaded with the charting
 * library, when first shown.
 */
export function AccountBalance({ accountId, from, to, label }: Props) {
  const { t } = useTranslation()
  const [view, setView] = useState<ReportView>('chart')
  const name = useId()
  const cashFlow = useQuery(cashFlowQuery({ from, to, accountId }))
  const views: ReportView[] = ['chart', 'table']

  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="sr-only">{t('reports.view.legend')}</legend>
        <div className="inline-grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {views.map((each) => (
            <label
              key={each}
              className={cn(
                'cursor-pointer rounded-md px-3 py-1.5 text-center text-sm font-medium text-muted-foreground has-checked:bg-background has-checked:text-foreground has-checked:shadow-sm',
                focusRingWithin,
              )}
            >
              <input type="radio" name={name} value={each} checked={view === each} onChange={() => setView(each)} className="sr-only" />
              {t(`reports.view.${each}`)}
            </label>
          ))}
        </div>
      </fieldset>
      {cashFlow.isError ? (
        <ErrorMessage>{t('reports.errors.notLoaded')}</ErrorMessage>
      ) : !cashFlow.data ? (
        <ReportLoading />
      ) : view === 'chart' ? (
        <BalanceLine cashFlow={cashFlow.data} label={label} />
      ) : (
        <CashFlowTable cashFlow={cashFlow.data} />
      )}
    </div>
  )
}
