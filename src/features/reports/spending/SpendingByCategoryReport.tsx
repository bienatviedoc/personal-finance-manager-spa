import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { accountsQuery, findAccount } from '@/features/accounts'
import { CategoryBadge } from '@/features/categories'
import { DonutChart, distinctColors } from '@/shared/charts'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { formatDate } from '@/shared/dates'
import { useLocale } from '@/shared/i18n/useLocale'
import { cn, focusRing } from '@/shared/lib/utils'
import { Money } from '@/shared/money'
import { spendingByCategoryQuery, spendingTransactionsQuery, type CategorySpending, type ReportCategory, type SpendingByCategory } from '../api/spendingByCategory'
import { ExportCsv } from '../frame/ExportCsv'
import { NotConverted } from '../frame/NotConverted'
import { ReportLoading } from '../frame/ReportLoading'
import { Share } from '../frame/Share'
import { reportQuery, type ReportFilters } from '../frame/useReportFilters'
import { drillNames, type DrillStep } from './drillDown'


/**
 * Where the money went (spec RPT-2): the expense total and each category's spent and share, as a donut or a
 * ranked table, drilling down from the top-level categories to a category's subcategories, then to the
 * transactions that make up its spending. Every figure is the API's.
 */
export function SpendingByCategoryReport({ filters }: { filters: ReportFilters }) {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const parentId = params.get(drillNames.parentId) ?? undefined
  const transactionsOf = params.get(drillNames.transactionsOf) ?? undefined
  const query = reportQuery(filters)
  const report = useQuery(spendingByCategoryQuery(query, parentId))

  const drill = (to: DrillStep) =>
    setParams((current) => {
      const next = new URLSearchParams(current)
      for (const [step, name] of Object.entries(drillNames)) {
        const value = to[step as keyof typeof to]
        if (value) next.set(name, value)
        else next.delete(name)
      }
      return next
    })
  const choose = (item: CategorySpending) =>
    item.drillsInto === 'subcategories' ? drill({ parentId: item.category.id }) : drill({ parentId, transactionsOf: item.category.id })

  return (
    <div className="space-y-6">
      <Breadcrumb parent={report.data?.parent ?? undefined} transactionsOf={transactionsOf} onDrill={drill} />
      {transactionsOf ? (
        <CategoryTransactions filters={filters} categoryId={transactionsOf} />
      ) : (
        <>
          {report.isError && <ErrorMessage>{t('reports.errors.notLoaded')}</ErrorMessage>}
          {report.isPending && <ReportLoading />}
          {report.data && <Breakdown report={report.data} filters={filters} onChoose={choose} />}
        </>
      )}
    </div>
  )
}

type BreadcrumbProps = {
  parent: ReportCategory | undefined
  transactionsOf: string | undefined
  onDrill: (to: DrillStep) => void
}

/** Where in the drill-down the report is, each step above the current one a way back up. */
function Breadcrumb({ parent, transactionsOf, onDrill }: BreadcrumbProps) {
  const { t } = useTranslation()
  if (!parent && !transactionsOf) return null
  const step = cn('rounded-sm underline underline-offset-2', focusRing)

  return (
    <nav aria-label={t('reports.spending.drillDown')} className="flex flex-wrap items-center gap-1 text-sm">
      <button type="button" className={step} onClick={() => onDrill({})}>
        {t('reports.spending.allCategories')}
      </button>
      {parent && (
        <>
          <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
          {transactionsOf ? (
            <button type="button" className={step} onClick={() => onDrill({ parentId: parent.id })}>
              {parent.name}
            </button>
          ) : (
            <span aria-current="page">{parent.name}</span>
          )}
        </>
      )}
    </nav>
  )
}

type BreakdownProps = { report: SpendingByCategory; filters: ReportFilters; onChoose: (item: CategorySpending) => void }

/** The spending of one level of the drill-down, with its total, as a chart or a table. */
function Breakdown({ report, filters, onChoose }: BreakdownProps) {
  const { t } = useTranslation()
  const locale = useLocale()
  const labelOf = (item: CategorySpending) =>
    report.parent && item.category.id === report.parent.id ? t('reports.spending.directly', { name: item.category.name }) : item.category.name
  const colors = distinctColors(report.items.map((item) => item.category.color))
  const colorOf = (index: number) => colors[index] ?? report.items[index]!.category.color
  const slices = report.items.map((item, index) => ({ key: item.category.id, value: Number(item.spent), color: colorOf(index) }))

  return (
    <>
      <dl className="grid grid-cols-1 gap-3 rounded-lg border p-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-muted-foreground">{t('reports.spending.total')}</dt>
          <dd className="text-lg font-medium tabular-nums">
            <Money amount={report.total} currency={report.currency} />
          </dd>
        </div>
        {report.previous && (
          <div>
            <dt className="text-sm text-muted-foreground">
              {t('reports.previousPeriod', { from: formatDate(report.previous.from, locale), to: formatDate(report.previous.to, locale) })}
            </dt>
            <dd className="text-lg font-medium tabular-nums">
              <Money amount={report.previous.total} currency={report.currency} />
              <NotConverted count={Number(report.previous.notConverted)} short />
            </dd>
          </div>
        )}
        <div className="sm:col-span-2">
          <NotConverted count={Number(report.notConverted)} />
        </div>
      </dl>

      <ExportCsv
        name="spending-by-category"
        filters={filters}
        columns={['category', 'spent', 'share', ...(report.previous ? ['previousSpent'] : []), 'notConverted', 'currency']}
        rows={report.items.map((item) => [
          labelOf(item),
          item.spent,
          item.share,
          ...(report.previous ? [item.previousSpent] : []),
          item.notConverted,
          report.currency,
        ])}
      />

      {report.items.length === 0 ? (
        <p className="text-muted-foreground">{t('reports.spending.empty')}</p>
      ) : filters.view === 'chart' ? (
        <div className="grid items-start gap-6 md:grid-cols-[auto_1fr]">
          {slices.some((slice) => slice.value > 0) ? (
            <DonutChart
              label={t('reports.spending.chart', { name: report.parent?.name ?? t('reports.spending.allCategories') })}
              slices={slices}
              onSelect={(key) => onChoose(report.items.find((item) => item.category.id === key)!)}
            />
          ) : (
            <p className="max-w-60 text-muted-foreground">{t('reports.spending.nothingToDraw')}</p>
          )}
          <ul aria-label={t('reports.spending.legend')} className="divide-y rounded-lg border">
            {report.items.map((item, index) => (
              <li key={item.category.id}>
                <button
                  type="button"
                  className={cn('flex w-full flex-wrap items-center gap-x-3 gap-y-1 p-3 text-left hover:bg-muted', focusRing)}
                  onClick={() => onChoose(item)}
                >
                  <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: colorOf(index) }} />
                  <span className="min-w-24 flex-1 break-words">{labelOf(item)}</span>
                  <span className="text-right">
                    <Money className="tabular-nums" amount={item.spent} currency={report.currency} />
                    <NotConverted count={Number(item.notConverted)} short />
                  </span>
                  <span className="w-14 text-right text-sm tabular-nums text-muted-foreground">
                    <Share share={item.share} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <SpendingTable report={report} labelOf={labelOf} onChoose={onChoose} />
      )}
    </>
  )
}

type SpendingTableProps = { report: SpendingByCategory; labelOf: (item: CategorySpending) => string; onChoose: (item: CategorySpending) => void }

/** The same numbers as the chart, ranked, for reading out and copying (spec section 7). */
function SpendingTable({ report, labelOf, onChoose }: SpendingTableProps) {
  const { t } = useTranslation()
  const captionId = useId()
  const cell = 'px-3 py-2'
  const number = cn(cell, 'text-right tabular-nums')

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table aria-labelledby={captionId} className="w-full text-sm">
        <caption id={captionId} className="sr-only">
          {t('reports.spending.table')}
        </caption>
        <thead className="border-b text-left text-muted-foreground">
          <tr>
            <th scope="col" className={cell}>
              {t('reports.spending.category')}
            </th>
            <th scope="col" className={cn(number, 'font-medium')}>
              {t('reports.spending.spent')}
            </th>
            <th scope="col" className={cn(number, 'font-medium')}>
              {t('reports.spending.share')}
            </th>
            {report.previous && (
              <th scope="col" className={cn(number, 'font-medium')}>
                {t('reports.spending.previousSpent')}
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y">
          {report.items.map((item) => (
            <tr key={item.category.id}>
              <td className={cell}>
                <button type="button" className={cn('flex items-center gap-2 text-left underline-offset-2 hover:underline', focusRing)} onClick={() => onChoose(item)}>
                  <CategoryBadge icon={item.category.icon} color={item.category.color} />
                  {labelOf(item)}
                </button>
              </td>
              <td className={number}>
                <Money amount={item.spent} currency={report.currency} />
                <NotConverted count={Number(item.notConverted)} short />
              </td>
              <td className={number}>
                <Share share={item.share} />
              </td>
              {report.previous && (
                <td className={number}>{item.previousSpent !== null && <Money amount={item.previousSpent} currency={report.currency} />}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The last step of the drill-down: the expenses in one category, each with what it spent there, so they add
 * up to the category's spent. A split shows only its part in the category.
 */
function CategoryTransactions({ filters, categoryId }: { filters: ReportFilters; categoryId: string }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const list = useQuery(spendingTransactionsQuery(reportQuery(filters), categoryId))
  const accounts = useQuery(accountsQuery({ includeArchived: true }))
  const captionId = useId()
  const cell = 'px-3 py-2'
  const number = cn(cell, 'text-right tabular-nums')

  if (list.isError) return <ErrorMessage>{t('reports.errors.notLoaded')}</ErrorMessage>
  if (!list.data) return <ReportLoading />
  const { category, currency, items } = list.data

  return (
    <>
      <h3 className="flex items-center gap-2 text-lg font-semibold">
        <CategoryBadge icon={category.icon} color={category.color} />
        {category.name}
      </h3>
      <dl className="space-y-1 rounded-lg border p-4">
        <dt className="text-sm text-muted-foreground">{t('reports.spending.total')}</dt>
        <dd className="text-lg font-medium tabular-nums">
          <Money amount={list.data.total} currency={currency} />
        </dd>
        <dd>
          <NotConverted count={Number(list.data.notConverted)} />
        </dd>
      </dl>
      <ExportCsv
        name="spending-by-category-transactions"
        filters={filters}
        columns={['date', 'payee', 'note', 'account', 'amount', 'currency', 'isRefund', 'isSplit', 'spent', 'baseCurrency']}
        rows={items.map((item) => [
          item.date,
          item.payee,
          item.note,
          findAccount(accounts.data?.accounts ?? [], item.accountId)?.name,
          item.amount,
          item.currency,
          item.isRefund,
          item.isSplit,
          item.spent,
          currency,
        ])}
      />
      {items.length === 0 ? (
        <p className="text-muted-foreground">{t('reports.spending.noTransactions')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table aria-labelledby={captionId} className="w-full text-sm">
            <caption id={captionId} className="sr-only">
              {t('reports.spending.transactionsIn', { name: category.name })}
            </caption>
            <thead className="border-b text-left text-muted-foreground">
              <tr>
                <th scope="col" className={cell}>
                  {t('reports.spending.date')}
                </th>
                <th scope="col" className={cell}>
                  {t('reports.spending.payee')}
                </th>
                <th scope="col" className={cell}>
                  {t('reports.spending.account')}
                </th>
                <th scope="col" className={cn(number, 'font-medium')}>
                  {t('reports.spending.amount')}
                </th>
                <th scope="col" className={cn(number, 'font-medium')}>
                  {t('reports.spending.spent')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className={cn(cell, 'whitespace-nowrap')}>{formatDate(item.date, locale)}</td>
                  <td className={cell}>
                    {item.payee ?? item.note ?? ''}
                    {item.isRefund && <span className="ml-2 text-xs text-muted-foreground">{t('reports.spending.refund')}</span>}
                    {item.isSplit && <span className="ml-2 text-xs text-muted-foreground">{t('reports.spending.split')}</span>}
                  </td>
                  <td className={cell}>{findAccount(accounts.data?.accounts ?? [], item.accountId)?.name ?? ''}</td>
                  <td className={number}>
                    <Money amount={item.amount} currency={item.currency} />
                  </td>
                  <td className={number}>
                    {item.spent === null ? <NotConverted count={1} short /> : <Money amount={item.spent} currency={currency} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
