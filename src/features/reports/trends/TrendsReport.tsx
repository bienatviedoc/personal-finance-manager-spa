import { useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import type { ParseKeys } from 'i18next'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { maxPayeeLength } from '@/shared/api/limits'
import { LineChart } from '@/shared/charts'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { SelectField } from '@/shared/components/SelectField'
import { TextField } from '@/shared/components/TextField'
import { formatDate, formatMonth, monthOf } from '@/shared/dates'
import type { Language } from '@/shared/i18n'
import { useLocale } from '@/shared/i18n/useLocale'
import { typingSettles, useDebounced } from '@/shared/lib/useDebounced'
import { cn } from '@/shared/lib/utils'
import { formatAxisAmount, Money, type Currency } from '@/shared/money'
import { trendQuery, type PeriodChange, type Trend, type TrendType } from '../api/trends'
import { ExportCsv } from '../frame/ExportCsv'
import { formatChangePercent } from '../frame/formatChangePercent'
import { monthName } from '../frame/monthName'
import { NotConverted } from '../frame/NotConverted'
import { ReportLoading } from '../frame/ReportLoading'
import { reportQuery, type ReportFilters } from '../frame/useReportFilters'

/** The name in the address the payee followed is kept in, next to the filters. */
const payeeParam = 'payee'

/** The name in the address that says a payee alone is followed by the income received from it. */
const typeParam = 'type'

/** The series of the chart: the period's, and the period before's, dashed, to compare with. */
const series = { total: { key: 'total', color: 'var(--chart-2)' }, previous: { key: 'previous', color: 'var(--chart-1)', dashed: true } }

/** The months along the bottom of the chart, short: `Jan 2026`. */
const shortMonths = (trend: Trend, locale: Language) => trend.months.map((month) => formatMonth(monthOf(month.from), locale, 'short'))

/**
 * One category or one payee over time (spec RPT-7): its total in each month of the period, as a line or a table,
 * each month with how it changed from the one before as an amount and a percentage, and with compare the period
 * before. The category is the frame's filter; the payee is typed here and kept in the address beside it.
 */
export function TrendsReport({ filters }: { filters: ReportFilters }) {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const payee = params.get(payeeParam)?.trim() || undefined
  // A category's kind says what it adds up; only a payee alone is followed by what the user chooses.
  const type: TrendType | undefined = payee && !filters.categoryId && params.get(typeParam) === 'income' ? 'income' : undefined

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-4">
        <PayeeFilter payee={payee ?? ''} />
        {payee && !filters.categoryId && <FollowBy type={type ?? 'expense'} />}
      </div>
      {filters.categoryId || payee ? <TrendOf filters={filters} payee={payee} type={type} /> : <p className="text-muted-foreground">{t('reports.trends.chooseWhat')}</p>}
    </div>
  )
}

/** Sets one name in the address, or takes it out when there is no value, keeping the rest; Back skips the change. */
function useSetParam() {
  const [, setParams] = useSearchParams()
  return (name: string, value: string | undefined) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value) next.set(name, value)
        else next.delete(name)
        return next
      },
      { replace: true },
    )
}

/** The payee to follow, typed; the report follows it once the user stops typing, and the address keeps it. */
function PayeeFilter({ payee }: { payee: string }) {
  const { t } = useTranslation()
  const setParam = useSetParam()
  const [typed, setTyped] = useState(payee)
  const [followed, setFollowed] = useState(payee)
  const settled = useDebounced(typed, typingSettles)
  // Follows the address when it changes anywhere else (Back, a bookmark).
  if (followed !== payee) {
    setFollowed(payee)
    setTyped(payee)
  }
  if (settled.trim() !== payee && settled === typed) {
    setFollowed(settled.trim())
    setParam(payeeParam, settled.trim() || undefined)
  }

  return (
    <div className="max-w-sm">
      <TextField label={t('reports.trends.payee')} hint={t('reports.trends.payeeHint')} value={typed} maxLength={maxPayeeLength} onChange={(event) => setTyped(event.target.value)} />
    </div>
  )
}

/** What a payee alone can be followed by, each with its label. */
const followChoices: { value: TrendType; label: ParseKeys }[] = [
  { value: 'expense', label: 'reports.trends.spentWith' },
  { value: 'income', label: 'reports.trends.receivedFrom' },
]

/** What a payee alone is followed by: what was spent with it, or what was received from it. Kept in the address. */
function FollowBy({ type }: { type: TrendType }) {
  const { t } = useTranslation()
  const setParam = useSetParam()
  const follow = (chosen: string) => setParam(typeParam, chosen === 'income' ? chosen : undefined)

  return (
    <div className="w-56">
      <SelectField
        label={t('reports.trends.followBy')}
        hint={t('reports.trends.followByHint')}
        value={type}
        onChange={(event) => follow(event.target.value)}
        options={followChoices.map(({ value, label }) => ({ value, label: t(label) }))}
      />
    </div>
  )
}

function TrendOf({ filters, payee, type }: { filters: ReportFilters; payee: string | undefined; type: TrendType | undefined }) {
  const { t } = useTranslation()
  const trend = useQuery(trendQuery(reportQuery(filters), payee, type))

  if (trend.isError) return <ErrorMessage>{t('reports.errors.notLoaded')}</ErrorMessage>
  if (!trend.data) return <ReportLoading />
  return <TrendView trend={trend.data} filters={filters} />
}

function TrendView({ trend, filters }: { trend: Trend; filters: ReportFilters }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const name = trend.category && trend.payee ? t('reports.trends.categoryAndPayee', { category: trend.category.name, payee: trend.payee }) : (trend.category?.name ?? trend.payee ?? '')
  const { currency, previous } = trend

  return (
    <>
      <dl className="grid grid-cols-1 gap-3 rounded-lg border p-4 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-muted-foreground">{t(trend.isIncome ? 'reports.trends.totalReceived' : 'reports.trends.totalSpent')}</dt>
          <dd className="text-lg font-medium tabular-nums">
            <Money amount={trend.total} currency={currency} />
          </dd>
        </div>
        {previous && (
          <div>
            <dt className="text-sm text-muted-foreground">{t('reports.previousPeriod', { from: formatDate(previous.from, locale), to: formatDate(previous.to, locale) })}</dt>
            <dd className="text-lg font-medium tabular-nums">
              <Money amount={previous.total} currency={currency} />
              <NotConverted count={Number(previous.notConverted)} short />
            </dd>
          </div>
        )}
        {trend.change && (
          <div>
            <dt className="text-sm text-muted-foreground">{t('reports.trends.changeFromPrevious')}</dt>
            <dd className="text-lg font-medium tabular-nums">
              <Change change={trend.change} currency={currency} />
            </dd>
          </div>
        )}
        <div className="sm:col-span-3">
          <NotConverted count={Number(trend.notConverted)} />
        </div>
      </dl>
      <ExportCsv
        name="trends"
        filters={filters}
        columns={['from', 'to', 'total', 'change', 'changePercent', 'notConverted', ...(previous ? ['previousFrom', 'previousTo', 'previousTotal'] : []), 'currency']}
        rows={trend.months.map((month, index) => {
          const before = previous?.months[index]
          return [
            month.from,
            month.to,
            month.total,
            month.change?.amount,
            month.change?.percent,
            month.notConverted,
            ...(previous ? [before?.from, before?.to, before?.total] : []),
            currency,
          ]
        })}
      />

      {filters.view === 'chart' ? (
        <LineChart
          label={t('reports.trends.chart', { name })}
          points={shortMonths(trend, locale)}
          series={[
            { ...series.total, values: trend.months.map((month) => Number(month.total)) },
            ...(previous ? [{ ...series.previous, values: previous.months.map((month) => Number(month.total)) }] : []),
          ]}
          formatValue={(value) => formatAxisAmount(value, locale)}
        />
      ) : (
        <TrendTable trend={trend} name={name} />
      )}
    </>
  )
}

/** The same numbers as the chart, month by month, for reading out and copying (spec section 7). */
function TrendTable({ trend, name }: { trend: Trend; name: string }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const captionId = useId()
  const cell = 'px-3 py-2'
  const number = cn(cell, 'text-right tabular-nums')
  const { currency, previous } = trend

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table aria-labelledby={captionId} className="w-full text-sm">
        <caption id={captionId} className="sr-only">
          {t('reports.trends.table', { name })}
        </caption>
        <thead className="border-b text-left text-muted-foreground">
          <tr>
            <th scope="col" className={cell}>
              {t('reports.trends.month')}
            </th>
            <th scope="col" className={cn(number, 'font-medium')}>
              {t('reports.trends.total')}
            </th>
            <th scope="col" className={cn(number, 'font-medium')}>
              {t('reports.trends.change')}
            </th>
            <th scope="col" className={cn(number, 'font-medium')}>
              {t('reports.trends.changePercent')}
            </th>
            {previous && (
              <th scope="col" className={cn(number, 'font-medium')}>
                {t('reports.trends.previousTotal')}
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y">
          {trend.months.map((month, index) => {
            const before = previous?.months[index]
            return (
              <tr key={month.from}>
                <th scope="row" className={cn(cell, 'text-left font-normal')}>
                  {formatMonth(monthOf(month.from), locale)}
                </th>
                <td className={number}>
                  <Money amount={month.total} currency={currency} />
                  <NotConverted count={Number(month.notConverted)} short />
                </td>
                <td className={number}>{month.change && <Money amount={month.change.amount} currency={currency} signed />}</td>
                <td className={number}>{month.change?.percent != null && formatChangePercent(month.change.percent, locale)}</td>
                {previous && (
                  <td className={number}>
                    {before && (
                      <>
                        <Money amount={before.total} currency={currency} />
                        <span className="block text-xs text-muted-foreground">{monthName(before, locale, t)}</span>
                      </>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** How a total moved: the amount with its sign, and the percentage when there is one (none from zero). */
function Change({ change, currency }: { change: PeriodChange; currency: Currency }) {
  const locale = useLocale()
  return (
    <>
      <Money amount={change.amount} currency={currency} signed />
      {change.percent != null && <span className="ml-2 text-sm text-muted-foreground">{formatChangePercent(change.percent, locale)}</span>}
    </>
  )
}
