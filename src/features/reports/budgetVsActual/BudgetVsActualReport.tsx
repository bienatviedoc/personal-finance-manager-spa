import { useQuery } from '@tanstack/react-query'
import { useId } from 'react'
import type { ParseKeys } from 'i18next'
import { useTranslation } from 'react-i18next'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { cn } from '@/shared/lib/utils'
import { Money, type Currency } from '@/shared/money'
import { budgetVsActualQuery, type BudgetVsActual, type BudgetVsActualState } from '../api/budgetVsActual'
import { NotConverted } from '../frame/NotConverted'
import { ReportLoading } from '../frame/ReportLoading'
import { reportQuery, type ReportFilters } from '../frame/useReportFilters'

/** What each state is called, as the budget screen calls it. */
const stateLabels: Record<BudgetVsActualState, ParseKeys> = {
  onTrack: 'reports.budgetVsActual.states.onTrack',
  warning: 'reports.budgetVsActual.states.warning',
  over: 'reports.budgetVsActual.states.over',
}

/**
 * Am I within budget (spec RPT-6): each category's budgets against what was spent against them over the whole
 * budget months of the period, one month or several summed, as horizontal bars or a table; and apart, what was
 * spent where no budget covered it. Every figure and state is the API's; nothing is added up here.
 */
export function BudgetVsActualReport({ filters }: { filters: ReportFilters }) {
  const { t } = useTranslation()
  const report = useQuery(budgetVsActualQuery(reportQuery(filters)))

  if (report.isError) return <ErrorMessage>{t('reports.errors.notLoaded')}</ErrorMessage>
  if (!report.data) return <ReportLoading />
  return <BudgetVsActualView report={report.data} />
}

function BudgetVsActualView({ report }: { report: BudgetVsActual }) {
  return <BudgetTable report={report} />
}

/** Each budgeted category's figures, and their totals, for reading out and copying (spec section 7). */
function BudgetTable({ report }: { report: BudgetVsActual }) {
  const { t } = useTranslation()
  const captionId = useId()
  const cell = 'px-3 py-2'
  const number = cn(cell, 'text-right tabular-nums')
  const { currency, totals } = report

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table aria-labelledby={captionId} className="w-full text-sm">
        <caption id={captionId} className="sr-only">
          {t('reports.budgetVsActual.table')}
        </caption>
        <thead className="border-b text-left text-muted-foreground">
          <tr>
            <th scope="col" className={cell}>
              {t('reports.budgetVsActual.category')}
            </th>
            <th scope="col" className={cn(number, 'font-medium')}>
              {t('reports.budgetVsActual.budgeted')}
            </th>
            <th scope="col" className={cn(number, 'font-medium')}>
              {t('reports.budgetVsActual.spent')}
            </th>
            <th scope="col" className={cn(number, 'font-medium')}>
              {t('reports.budgetVsActual.remaining')}
            </th>
            <th scope="col" className={cn(number, 'font-medium')}>
              {t('reports.budgetVsActual.percentSpent')}
            </th>
            <th scope="col" className={cn(cell, 'font-medium')}>
              {t('reports.budgetVsActual.state')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {report.items.map((item) => (
            <tr key={item.category.id}>
              <th scope="row" className={cn(cell, 'text-left font-normal', item.category.parentId && 'pl-8')}>
                {item.category.name}
              </th>
              <td className={number}>
                <Money amount={item.budgeted} currency={currency} />
              </td>
              <td className={number}>
                <Money amount={item.spent} currency={currency} />
                <NotConverted count={Number(item.notConverted)} short />
              </td>
              <td className={number}>
                <Money amount={item.remaining} currency={currency} />
              </td>
              <td className={number}>{item.percentSpent != null && t('reports.budgetVsActual.percent', { percent: Number(item.percentSpent) })}</td>
              <td className={cell}>{t(stateLabels[item.state])}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t font-medium">
          <TotalRow label={t('reports.budgetVsActual.total')} budgeted={totals.budgeted} spent={totals.spent} remaining={totals.remaining} currency={currency} />
        </tfoot>
      </table>
    </div>
  )
}

function TotalRow({ label, budgeted, spent, remaining, currency }: { label: string; budgeted: string; spent: string; remaining: string; currency: Currency }) {
  const cell = 'px-3 py-2'
  const number = cn(cell, 'text-right tabular-nums')
  return (
    <tr>
      <th scope="row" className={cn(cell, 'text-left')}>
        {label}
      </th>
      <td className={number}>
        <Money amount={budgeted} currency={currency} />
      </td>
      <td className={number}>
        <Money amount={spent} currency={currency} />
      </td>
      <td className={number}>
        <Money amount={remaining} currency={currency} />
      </td>
      <td className={number} />
      <td className={cell} />
    </tr>
  )
}
