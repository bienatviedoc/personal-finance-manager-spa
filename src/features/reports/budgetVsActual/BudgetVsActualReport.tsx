import { useQuery } from '@tanstack/react-query'
import { useId } from 'react'
import type { ParseKeys } from 'i18next'
import { useTranslation } from 'react-i18next'
import { BarChart } from '@/shared/charts'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { formatMonth, monthOf } from '@/shared/dates'
import { useLocale } from '@/shared/i18n/useLocale'
import { cn } from '@/shared/lib/utils'
import { formatAxisAmount, Money, type Currency } from '@/shared/money'
import { budgetVsActualQuery, type BudgetVsActual, type BudgetVsActualState } from '../api/budgetVsActual'
import { ExportCsv } from '../frame/ExportCsv'
import { numberColumn, type ReportCsv } from '../frame/reportCsv'
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
  return <BudgetVsActualView report={report.data} filters={filters} />
}

/** The bars: what was budgeted, and what was spent beside it. */
const series = { budgeted: { key: 'budgeted', color: 'var(--chart-1)' }, spent: { key: 'spent', color: 'var(--chart-2)' } }

function BudgetVsActualView({ report, filters }: { report: BudgetVsActual; filters: ReportFilters }) {
  const { t } = useTranslation()
  const locale = useLocale()

  const { currency, totals } = report
  const [first, last] = [formatMonth(monthOf(report.from), locale), formatMonth(monthOf(report.to), locale)]

  // Each row says what it is by a code of its own, so the file is the same in every language (see ExportCsv).
  const csv: ReportCsv = {
    name: 'budget-vs-actual',
    columns: ['row', 'category', numberColumn('budgeted'), numberColumn('spent'), numberColumn('remaining'), numberColumn('percentSpent'), 'state', numberColumn('months'), numberColumn('notConverted'), 'currency'],
    rows: [
      ...report.items.map((item) => [
        'budget',
        item.category.name,
        item.budgeted,
        item.spent,
        item.remaining,
        item.percentSpent,
        item.state,
        item.months,
        item.notConverted,
        currency,
      ]),
      ...(report.items.length > 0
        ? [['total', null, totals.budgeted, totals.spent, totals.remaining, null, null, null, totals.notConverted, currency]]
        : []),
      // What was spent with no budget, apart as the screen lists it, and its total.
      ...report.unbudgeted.map((item) => ['unbudgeted', item.category.name, null, item.spent, null, null, null, null, item.notConverted, currency]),
      ...(report.unbudgeted.length > 0
        ? [['unbudgetedTotal', null, null, report.unbudgetedTotal.spent, null, null, null, null, report.unbudgetedTotal.notConverted, currency]]
        : []),
    ],
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {Number(report.months) === 1 ? t('reports.budgetVsActual.oneMonth', { month: first }) : t('reports.budgetVsActual.months', { first, last })}
      </p>
      <dl className="grid grid-cols-1 gap-3 rounded-lg border p-4 sm:grid-cols-3">
        <Figure label={t('reports.budgetVsActual.budgeted')} amount={totals.budgeted} currency={currency} />
        <Figure label={t('reports.budgetVsActual.spent')} amount={totals.spent} currency={currency} />
        <Figure label={t('reports.budgetVsActual.remaining')} amount={totals.remaining} currency={currency} />
      </dl>
      <NotConverted count={Number(totals.notConverted)} />
      <ExportCsv csv={csv} filters={filters} />
      {report.items.length === 0 ? (
        <p className="text-muted-foreground">{t('reports.budgetVsActual.noBudgets')}</p>
      ) : filters.view === 'chart' ? (
        <BarChart
          label={t('reports.budgetVsActual.chart')}
          categories={report.items.map((item) => item.category.name)}
          series={[
            { ...series.budgeted, name: t('reports.budgetVsActual.budgeted'), values: report.items.map((item) => Number(item.budgeted)) },
            { ...series.spent, name: t('reports.budgetVsActual.spent'), values: report.items.map((item) => Number(item.spent)) },
          ]}
          formatValue={(value) => formatAxisAmount(value, locale)}
        />
      ) : (
        <BudgetTable report={report} />
      )}
      <Unbudgeted report={report} />
    </>
  )
}

function Figure({ label, amount, currency }: { label: string; amount: string; currency: Currency }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-lg font-medium tabular-nums">
        <Money amount={amount} currency={currency} />
      </dd>
    </div>
  )
}

/**
 * What was spent in a month where no budget covered its category, by category, most first (spec RPT-6): listed
 * apart, in either view, since there is nothing to set it against.
 */
function Unbudgeted({ report }: { report: BudgetVsActual }) {
  const { t } = useTranslation()
  const headingId = useId()
  const cell = 'px-3 py-2'
  const number = cn(cell, 'text-right tabular-nums')
  const { currency, unbudgeted, unbudgetedTotal } = report
  if (unbudgeted.length === 0) return null

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h3 id={headingId} className="text-lg font-semibold">
        {t('reports.budgetVsActual.unbudgeted')}
      </h3>
      <p className="text-sm text-muted-foreground">{t('reports.budgetVsActual.unbudgetedHint')}</p>
      <div className="overflow-x-auto rounded-lg border">
        <table aria-labelledby={headingId} className="w-full text-sm">
          <thead className="border-b text-left text-muted-foreground">
            <tr>
              <th scope="col" className={cell}>
                {t('reports.budgetVsActual.category')}
              </th>
              <th scope="col" className={cn(number, 'font-medium')}>
                {t('reports.budgetVsActual.spent')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {unbudgeted.map((item) => (
              <tr key={item.category.id}>
                <th scope="row" className={cn(cell, 'text-left font-normal')}>
                  {item.category.name}
                </th>
                <td className={number}>
                  <Money amount={item.spent} currency={currency} />
                  <NotConverted count={Number(item.notConverted)} short />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t font-medium">
            <tr>
              <th scope="row" className={cn(cell, 'text-left')}>
                {t('reports.budgetVsActual.total')}
              </th>
              <td className={number}>
                <Money amount={unbudgetedTotal.spent} currency={currency} />
                <NotConverted count={Number(unbudgetedTotal.notConverted)} short />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
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
                {Number(item.months) < Number(report.months) && (
                  <span className="block text-xs text-muted-foreground">
                    {t('reports.budgetVsActual.budgetedMonths', { count: Number(item.months), total: Number(report.months) })}
                  </span>
                )}
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
