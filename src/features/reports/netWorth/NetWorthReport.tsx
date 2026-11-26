import { useQuery } from '@tanstack/react-query'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { StackedAreaChart } from '@/shared/charts'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { formatDate } from '@/shared/dates'
import { useLocale } from '@/shared/i18n/useLocale'
import { cn } from '@/shared/lib/utils'
import { formatAxisAmount, Money } from '@/shared/money'
import { netWorthQuery, type NetWorth } from '../api/netWorth'
import { ExportCsv } from '../frame/ExportCsv'
import { NotConverted } from '../frame/NotConverted'
import { ReportLoading } from '../frame/ReportLoading'
import { reportQuery, type ReportFilters } from '../frame/useReportFilters'

/** The areas of the chart, assets above zero and liabilities below it, and net worth, the line over them. */
const series = {
  assets: { key: 'assets', color: 'var(--chart-2)' },
  liabilities: { key: 'liabilities', color: 'var(--chart-1)' },
  netWorth: { key: 'netWorth', color: 'var(--chart-4)' },
}

/**
 * What the user is worth over time (spec RPT-5): the assets, the liabilities and the assets minus the liabilities
 * at each month end of the period, as stacked areas or a table. Credit cards and loans are the liabilities, and
 * archived accounts count; the API works that out.
 */
export function NetWorthReport({ filters }: { filters: ReportFilters }) {
  const { t } = useTranslation()
  const netWorth = useQuery(netWorthQuery(reportQuery(filters)))

  if (netWorth.isError) return <ErrorMessage>{t('reports.errors.notLoaded')}</ErrorMessage>
  if (!netWorth.data) return <ReportLoading />
  return <NetWorthView netWorth={netWorth.data} filters={filters} />
}

function NetWorthView({ netWorth, filters }: { netWorth: NetWorth; filters: ReportFilters }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { currency, items } = netWorth
  const last = items.at(-1)

  return (
    <>
      {last && (
        <dl className="space-y-1 rounded-lg border p-4">
          <dt className="text-sm text-muted-foreground">{t('reports.netWorth.on', { date: formatDate(last.date, locale) })}</dt>
          <dd className="text-lg font-medium tabular-nums">
            <Money amount={last.netWorth} currency={currency} />
          </dd>
          <dd>
            <NotConverted count={Number(last.notConverted)} />
          </dd>
        </dl>
      )}
      <ExportCsv
        name="net-worth"
        filters={filters}
        columns={['date', 'assets', 'liabilities', 'netWorth', 'notConverted', 'currency']}
        rows={items.map((item) => [item.date, item.assets, item.liabilities, item.netWorth, item.notConverted, currency])}
      />

      {filters.view === 'chart' ? (
        <StackedAreaChart
          label={t('reports.netWorth.chart')}
          points={items.map((item) => formatDate(item.date, locale))}
          areas={[
            { ...series.assets, name: t('reports.netWorth.assets'), values: items.map((item) => Number(item.assets)) },
            { ...series.liabilities, name: t('reports.netWorth.liabilities'), values: items.map((item) => -Number(item.liabilities)) },
          ]}
          line={{ ...series.netWorth, name: t('reports.netWorth.netWorth'), values: items.map((item) => Number(item.netWorth)) }}
          formatValue={(value) => formatAxisAmount(value, locale)}
        />
      ) : (
        <NetWorthTable netWorth={netWorth} />
      )}
    </>
  )
}

/** The same numbers as the chart, month end by month end, for reading out and copying (spec section 7). */
function NetWorthTable({ netWorth }: { netWorth: NetWorth }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const captionId = useId()
  const cell = 'px-3 py-2'
  const number = cn(cell, 'text-right tabular-nums')
  const { currency } = netWorth

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table aria-labelledby={captionId} className="w-full text-sm">
        <caption id={captionId} className="sr-only">
          {t('reports.netWorth.table')}
        </caption>
        <thead className="border-b text-left text-muted-foreground">
          <tr>
            <th scope="col" className={cell}>
              {t('reports.netWorth.date')}
            </th>
            <th scope="col" className={cn(number, 'font-medium')}>
              {t('reports.netWorth.assets')}
            </th>
            <th scope="col" className={cn(number, 'font-medium')}>
              {t('reports.netWorth.liabilities')}
            </th>
            <th scope="col" className={cn(number, 'font-medium')}>
              {t('reports.netWorth.netWorth')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {netWorth.items.map((item) => (
            <tr key={item.date}>
              <th scope="row" className={cn(cell, 'text-left font-normal')}>
                {formatDate(item.date, locale)}
              </th>
              <td className={number}>
                <Money amount={item.assets} currency={currency} />
              </td>
              <td className={number}>
                <Money amount={item.liabilities} currency={currency} />
              </td>
              <td className={number}>
                <Money amount={item.netWorth} currency={currency} />
                <NotConverted count={Number(item.notConverted)} short />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
