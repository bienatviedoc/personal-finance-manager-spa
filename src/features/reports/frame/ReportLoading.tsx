import { useTranslation } from 'react-i18next'

/** Stands in for a report while it loads. */
export function ReportLoading() {
  const { t } = useTranslation()
  return (
    <div aria-busy aria-label={t('reports.loading')} role="status" className="space-y-3">
      <div className="h-16 animate-pulse rounded-lg bg-muted" />
      <div className="h-40 animate-pulse rounded-lg bg-muted" />
    </div>
  )
}
