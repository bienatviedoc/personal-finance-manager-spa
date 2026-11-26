import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import type { CalendarDate } from '@/shared/dates'
import { cashFlowQuery } from '../api/cashFlow'
import type { ReportView } from '../frame/useReportFilters'
import { ReportLoading } from '../frame/ReportLoading'
import { ViewToggle } from '../frame/ViewToggle'
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
  const cashFlow = useQuery(cashFlowQuery({ from, to, accountId }))

  return (
    <div className="space-y-3">
      <ViewToggle view={view} onChange={setView} className="inline-block" />
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
