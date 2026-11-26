import { useQuery } from '@tanstack/react-query'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { formatDate } from '@/shared/dates'
import { useLocale } from '@/shared/i18n/useLocale'
import { cn, focusRingWithin } from '@/shared/lib/utils'
import { Money } from '@/shared/money'
import { balanceIntervals, cashFlowQuery, type BalanceInterval, type CashFlow } from '../api/cashFlow'
import { ExportCsv, type ReportCsv } from '../frame/ExportCsv'
import { NotConverted } from '../frame/NotConverted'
import { ReportLoading } from '../frame/ReportLoading'
import { reportQuery, type ReportFilters } from '../frame/useReportFilters'
import { BalanceLine } from './BalanceLine'

/** The name in the address the interval is kept in, next to the filters; daily when it is not there. */
const intervalParam = 'interval'

/**
 * How a balance moved over the period (spec RPT-4): the running balance at the end of every day, or of every
 * week, as a line or a table. Of one account in its own currency with the account filter, otherwise of all of
 * them in the base currency; the API works that out. Daily or weekly is chosen here and kept in the address.
 */
export function CashFlowReport({ filters }: { filters: ReportFilters }) {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const interval: BalanceInterval = params.get(intervalParam) === 'week' ? 'week' : 'day'
  const { from, to, accountId } = reportQuery(filters)
  const cashFlow = useQuery(cashFlowQuery({ from, to, accountId, interval }))

  const choose = (chosen: BalanceInterval) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (chosen === 'day') next.delete(intervalParam)
        else next.set(intervalParam, chosen)
        return next
      },
      { replace: true },
    )

  return (
    <>
      <IntervalToggle interval={interval} onChange={choose} />
      {cashFlow.isError ? (
        <ErrorMessage>{t('reports.errors.notLoaded')}</ErrorMessage>
      ) : cashFlow.data ? (
        <CashFlowView cashFlow={cashFlow.data} filters={filters} />
      ) : (
        <ReportLoading />
      )}
    </>
  )
}

/** Daily or weekly: how often the balance is shown. */
function IntervalToggle({ interval, onChange }: { interval: BalanceInterval; onChange: (interval: BalanceInterval) => void }) {
  const { t } = useTranslation()
  const name = useId()
  return (
    <fieldset>
      <legend className="sr-only">{t('reports.cashFlow.interval')}</legend>
      <div className="inline-grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {balanceIntervals.map((each) => (
          <label
            key={each}
            className={cn(
              'cursor-pointer rounded-md px-3 py-1.5 text-center text-sm font-medium text-muted-foreground has-checked:bg-background has-checked:text-foreground has-checked:shadow-sm',
              focusRingWithin,
            )}
          >
            <input type="radio" name={name} value={each} checked={interval === each} onChange={() => onChange(each)} className="sr-only" />
            {t(`reports.cashFlow.intervals.${each}`)}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function CashFlowView({ cashFlow, filters }: { cashFlow: CashFlow; filters: ReportFilters }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { currency, items } = cashFlow
  const last = items.at(-1)

  const csv: ReportCsv = {
    name: 'cash-flow',
    columns: ['date', 'balance', 'notConverted', 'currency'],
    rows: items.map((item) => [item.date, item.balance, item.notConverted, currency]),
  }

  return (
    <>
      {last && (
        <dl className="space-y-1 rounded-lg border p-4">
          <dt className="text-sm text-muted-foreground">{t('reports.cashFlow.on', { date: formatDate(last.date, locale) })}</dt>
          <dd className="text-lg font-medium tabular-nums">
            <Money amount={last.balance} currency={currency} />
          </dd>
          <dd>
            <NotConverted count={Number(last.notConverted)} />
          </dd>
        </dl>
      )}
      <ExportCsv csv={csv} filters={filters} />
      {filters.view === 'chart' ? <BalanceLine cashFlow={cashFlow} label={t('reports.cashFlow.chart')} /> : <CashFlowTable cashFlow={cashFlow} />}
    </>
  )
}

/** The same numbers as the chart, day by day or week by week, for reading out and copying (spec section 7). */
export function CashFlowTable({ cashFlow }: { cashFlow: CashFlow }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const captionId = useId()
  const cell = 'px-3 py-2'
  const number = cn(cell, 'text-right tabular-nums')

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table aria-labelledby={captionId} className="w-full text-sm">
        <caption id={captionId} className="sr-only">
          {t('reports.cashFlow.table')}
        </caption>
        <thead className="border-b text-left text-muted-foreground">
          <tr>
            <th scope="col" className={cell}>
              {t('reports.cashFlow.date')}
            </th>
            <th scope="col" className={cn(number, 'font-medium')}>
              {t('reports.cashFlow.balance')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {cashFlow.items.map((item) => (
            <tr key={item.date}>
              <th scope="row" className={cn(cell, 'text-left font-normal')}>
                {formatDate(item.date, locale)}
              </th>
              <td className={number}>
                <Money amount={item.balance} currency={cashFlow.currency} />
                <NotConverted count={Number(item.notConverted)} short />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
