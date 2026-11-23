import type { ParseKeys } from 'i18next'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, NavLink, useParams } from 'react-router'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { cn, focusRing } from '@/shared/lib/utils'
import { ReportFrame } from '../frame/ReportFrame'
import type { ReportFilters } from '../frame/useReportFilters'
import { SpendingByCategoryReport } from '../spending/SpendingByCategoryReport'

/** A report: its address under `/reports`, its name, how the frame is set up for it, and the report itself. */
type Report = {
  path: string
  title: ParseKeys
  categoryKind?: 'income' | 'expense'
  canCompare?: boolean
  render: (filters: ReportFilters) => ReactNode
}

/** Every report there is, in the order the screen offers them. A new report is a new entry. */
const reports: Report[] = [
  {
    path: 'spending-by-category',
    title: 'reports.spending.title',
    categoryKind: 'expense',
    canCompare: true,
    render: (filters) => <SpendingByCategoryReport filters={filters} />,
  },
]

/**
 * The reports screen (spec section 12): the reports to choose from, and the chosen one in the shared frame of
 * filters and views. `/reports` opens the first.
 */
export function ReportsPage() {
  const { t } = useTranslation()
  const { report: asked } = useParams()
  const report = reports.find((each) => each.path === asked)
  useDocumentTitle(t('screens.reports'))

  if (asked === undefined) return <Navigate to={reports[0]!.path} replace />

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('screens.reports')}</h1>
      <nav aria-label={t('reports.choose')} className="flex flex-wrap gap-2">
        {reports.map((each) => (
          <NavLink
            key={each.path}
            to={`/reports/${each.path}`}
            className={({ isActive }) => cn('rounded-md border px-3 py-1.5 text-sm', isActive ? 'bg-muted font-medium' : 'hover:bg-muted', focusRing)}
          >
            {t(each.title)}
          </NavLink>
        ))}
      </nav>
      {report ? (
        // A report starts again when another is chosen: what was drilled into in one means nothing in the next.
        <ReportFrame key={report.path} title={t(report.title)} categoryKind={report.categoryKind} canCompare={report.canCompare}>
          {report.render}
        </ReportFrame>
      ) : (
        <p className="text-muted-foreground">{t('reports.notFound')}</p>
      )}
    </div>
  )
}
