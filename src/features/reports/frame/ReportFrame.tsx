import { useQuery } from '@tanstack/react-query'
import { useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { accountsQuery } from '@/features/accounts'
import { categoriesQuery, useCategoryChoices, type CategoryKind } from '@/features/categories'
import { SelectField } from '@/shared/components/SelectField'
import { calendarDatePattern, type CalendarDate } from '@/shared/dates'
import { TextField } from '@/shared/components/TextField'
import { periodChoices, type PeriodChoice } from './reportPeriod'
import { useReportFilters, type ReportFilters } from './useReportFilters'
import { ViewToggle } from './ViewToggle'

type Props = {
  /** The report's name, the heading of its section. */
  title: string
  /** Only categories of this kind are offered by the category filter, the only ones the report can show. */
  categoryKind?: CategoryKind
  /** Whether the report can be compared with the period before (spec section 7: RPT-2, RPT-3 and RPT-7). */
  canCompare?: boolean
  /** Whether the category filter is offered; not for a report of balances, which belong to no category. */
  hasCategoryFilter?: boolean
  /** The names in the address the report keeps how far it is drilled down in, started again by another category filter. */
  drillDown?: readonly string[]
  /** The report itself, under the filters it is shown with. */
  children: (filters: ReportFilters) => ReactNode
}

/**
 * The frame every report is shown in (spec section 7, common behaviour; section 12, Reports): the period, a
 * preset or dates the user chooses, the account and category filters, comparing with the period before, and
 * a choice of chart or table, all kept in the address. The report inside draws what the filters ask for.
 */
export function ReportFrame({ title, categoryKind, canCompare = false, hasCategoryFilter = true, drillDown, children }: Props) {
  const { t } = useTranslation()
  const titleId = useId()
  const { filters, change } = useReportFilters(drillDown)
  // Archived ones too: what happened on them is still in the reports.
  const accounts = useQuery(accountsQuery({ includeArchived: true }))
  const categories = useQuery(categoriesQuery({ includeArchived: true }))
  const categoryChoices = useCategoryChoices((categories.data ?? []).filter((category) => !categoryKind || category.kind === categoryKind))

  return (
    <section aria-labelledby={titleId} className="space-y-6">
      <h2 id={titleId} className="text-xl font-semibold">
        {title}
      </h2>

      <form role="search" aria-label={t('reports.filters.title')} className="grid grid-cols-2 gap-3 sm:grid-cols-4" onSubmit={(event) => event.preventDefault()}>
        <SelectField
          label={t('reports.filters.period')}
          value={filters.period}
          onChange={(event) => change({ period: event.target.value as PeriodChoice })}
          options={periodChoices.map((period) => ({ value: period, label: t(`reports.periods.${period}`) }))}
        />
        <DateFilter
          label={t('reports.filters.from')}
          date={filters.from}
          max={filters.to}
          outOfRange={t('reports.filters.fromAfterTo')}
          onChange={(from) => change({ from })}
        />
        <DateFilter label={t('reports.filters.to')} date={filters.to} min={filters.from} outOfRange={t('reports.filters.toBeforeFrom')} onChange={(to) => change({ to })} />
        <SelectField
          label={t('reports.filters.account')}
          value={filters.accountId ?? ''}
          onChange={(event) => change({ accountId: event.target.value || undefined })}
          options={[{ value: '', label: t('reports.filters.allAccounts') }, ...(accounts.data?.accounts ?? []).map((account) => ({ value: account.id, label: account.name }))]}
        />
        {hasCategoryFilter && (
          <SelectField
            label={t('reports.filters.category')}
            value={filters.categoryId ?? ''}
            onChange={(event) => change({ categoryId: event.target.value || undefined })}
            options={[{ value: '', label: t('reports.filters.allCategories') }, ...categoryChoices.map(({ category, label }) => ({ value: category.id, label }))]}
          />
        )}
        {canCompare && (
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" className="size-4" checked={filters.compare} onChange={(event) => change({ compare: event.target.checked })} />
            {t('reports.filters.compare')}
          </label>
        )}
        <ViewToggle view={filters.view} onChange={(view) => change({ view })} className="col-span-2 self-end sm:col-span-1" />
      </form>

      {children(filters)}
    </section>
  )
}

type DateFilterProps = {
  label: string
  date: CalendarDate
  min?: CalendarDate
  max?: CalendarDate
  /** Already translated: said when a whole date is typed on the wrong side of the other end. */
  outOfRange: string
  onChange: (date: CalendarDate) => void
}

/**
 * One end of the period. What is typed shows at once and becomes the period once it is a whole date, on the right
 * side of the other end, and is said to be wrong when it is on the other side; it follows the period when that
 * changes anywhere else (a preset chosen, another address).
 */
function DateFilter({ label, date, min, max, outOfRange, onChange }: DateFilterProps) {
  const [typed, setTyped] = useState(date)
  const [followed, setFollowed] = useState(date)
  if (followed !== date) {
    setFollowed(date)
    setTyped(date)
  }

  const whole = calendarDatePattern.test(typed)
  const inRange = (!min || typed >= min) && (!max || typed <= max)

  return (
    <TextField
      type="date"
      label={label}
      value={typed}
      error={whole && !inRange ? outOfRange : undefined}
      min={min}
      max={max}
      required
      onChange={(event) => {
        const value = event.target.value
        setTyped(value)
        if (calendarDatePattern.test(value) && (!min || value >= min) && (!max || value <= max)) onChange(value)
      }}
    />
  )
}

