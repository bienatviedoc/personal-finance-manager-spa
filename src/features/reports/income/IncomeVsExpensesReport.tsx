import { useQuery } from '@tanstack/react-query'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { BarsWithLineChart } from '@/shared/charts'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { formatDate, formatMonth, monthOf } from '@/shared/dates'
import { useLocale } from '@/shared/i18n/useLocale'
import { cn } from '@/shared/lib/utils'
import { formatMoney, Money, type Currency } from '@/shared/money'
import { incomeVsExpensesQuery, type IncomeAndExpenses, type MonthIncomeAndExpenses } from '../api/incomeVsExpenses'
import { NotConverted } from '../frame/NotConverted'
import { Share } from '../frame/Share'
import { reportQuery, type ReportFilters } from '../frame/useReportFilters'

/**
 * Am I saving (spec RPT-3): income, expenses and net in each month, with the savings rate, as grouped bars with a
 * net line or as a table, and the same over the whole period; with compare, the period before beside it. Every
 * figure is the API's.
 */
export function IncomeVsExpensesReport({ filters }: { filters: ReportFilters }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const report = useQuery(incomeVsExpensesQuery(reportQuery(filters)))

  if (report.isError) return <ErrorMessage>{t('reports.errors.notLoaded')}</ErrorMessage>
  if (!report.data) return <Loading />
  const { currency, total, months, previous } = report.data
  const previousTitle = previous && t('reports.previousPeriod', { from: formatDate(previous.from, locale), to: formatDate(previous.to, locale) })

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-2">
        <Summary title={t('reports.income.wholePeriod')} flow={total} currency={currency} />
        {previous && <Summary title={previousTitle!} flow={previous.total} currency={currency} />}
      </div>
      <NotConverted count={Number(total.notConverted)} />

      {filters.view === 'chart' ? (
        <MonthsChart months={months} currency={currency} />
      ) : (
        <>
          <MonthsTable caption={t('reports.income.table')} months={months} total={total} currency={currency} />
          {previous && <MonthsTable caption={t('reports.income.previousTable')} months={previous.months} total={previous.total} currency={currency} />}
        </>
      )}
    </div>
  )
}

/** Income, expenses, net and the savings rate over some period. */
function Summary({ title, flow, currency }: { title: string; flow: IncomeAndExpenses; currency: Currency }) {
  const { t } = useTranslation()
  const titleId = useId()
  const figures = [
    ['income', <Money amount={flow.income} currency={currency} />],
    ['expenses', <Money amount={flow.expenses} currency={currency} />],
    ['net', <Money amount={flow.net} currency={currency} />],
    ['savingsRate', <SavingsRate rate={flow.savingsRate} />],
  ] as const

  return (
    <section aria-labelledby={titleId} className="rounded-lg border p-4">
      <h3 id={titleId} className="mb-2 text-sm font-medium text-muted-foreground">
        {title}
      </h3>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {figures.map(([key, figure]) => (
          <div key={key}>
            <dt className="text-sm text-muted-foreground">{t(`reports.income.${key}`)}</dt>
            <dd className="text-lg font-medium tabular-nums">{figure}</dd>
          </div>
        ))}
      </dl>
      <NotConverted count={Number(flow.notConverted)} short />
    </section>
  )
}

/** A savings rate as the API works it out; a dash when there is none, as with no income. */
function SavingsRate({ rate }: { rate: number | string | null }) {
  return rate === null ? <>–</> : <Share share={rate} />
}

/** The months as grouped bars of income and expenses, with net as a line over them. */
function MonthsChart({ months, currency }: { months: MonthIncomeAndExpenses[]; currency: Currency }) {
  const { t } = useTranslation()
  const locale = useLocale()

  return (
    <BarsWithLineChart
      label={t('reports.income.chart')}
      points={months.map((month) => formatMonth(monthOf(month.month), locale))}
      bars={[
        { key: 'income', name: t('reports.income.income'), color: 'var(--color-success)', values: months.map((month) => Number(month.income)) },
        { key: 'expenses', name: t('reports.income.expenses'), color: 'var(--color-destructive)', values: months.map((month) => Number(month.expenses)) },
      ]}
      line={{ key: 'net', name: t('reports.income.net'), color: 'var(--color-foreground)', values: months.map((month) => Number(month.net)) }}
      format={(value) => formatMoney(String(value), currency, locale)}
    />
  )
}

type MonthsTableProps = { caption: string; months: MonthIncomeAndExpenses[]; total: IncomeAndExpenses; currency: Currency }

/** The same numbers as the chart, a month a row and the whole period at the foot, for reading out and copying (spec section 7). */
function MonthsTable({ caption, months, total, currency }: MonthsTableProps) {
  const { t } = useTranslation()
  const locale = useLocale()
  const captionId = useId()
  const cell = 'px-3 py-2'
  const number = cn(cell, 'text-right tabular-nums')
  const figures = (flow: IncomeAndExpenses) => (
    <>
      <td className={number}>
        <Money amount={flow.income} currency={currency} />
      </td>
      <td className={number}>
        <Money amount={flow.expenses} currency={currency} />
      </td>
      <td className={number}>
        <Money amount={flow.net} currency={currency} />
      </td>
      <td className={number}>
        <SavingsRate rate={flow.savingsRate} />
      </td>
    </>
  )

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table aria-labelledby={captionId} className="w-full text-sm">
        <caption id={captionId} className="sr-only">
          {caption}
        </caption>
        <thead className="border-b text-left text-muted-foreground">
          <tr>
            <th scope="col" className={cell}>
              {t('reports.income.month')}
            </th>
            {(['income', 'expenses', 'net', 'savingsRate'] as const).map((key) => (
              <th key={key} scope="col" className={cn(number, 'font-medium')}>
                {t(`reports.income.${key}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {months.map((month) => (
            <tr key={month.month}>
              <th scope="row" className={cn(cell, 'text-left font-normal')}>
                {formatMonth(monthOf(month.month), locale)}
                <NotConverted count={Number(month.notConverted)} short />
              </th>
              {figures(month)}
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t font-medium">
          <tr>
            <th scope="row" className={cn(cell, 'text-left')}>
              {t('reports.income.wholePeriod')}
            </th>
            {figures(total)}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/** Stands in for the report while it loads. */
function Loading() {
  const { t } = useTranslation()
  return (
    <div aria-busy aria-label={t('reports.loading')} role="status" className="space-y-3">
      <div className="h-16 animate-pulse rounded-lg bg-muted" />
      <div className="h-40 animate-pulse rounded-lg bg-muted" />
    </div>
  )
}
