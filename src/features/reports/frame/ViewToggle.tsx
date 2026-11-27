import { useTranslation } from 'react-i18next'
import { SegmentedControl } from '@/shared/components/SegmentedControl'
import type { ReportView } from './useReportFilters'

const views: ReportView[] = ['chart', 'table']

/** Chart or table: the same numbers either way (spec section 7, "every chart has a table view"). */
export function ViewToggle({ view, onChange, className }: { view: ReportView; onChange: (view: ReportView) => void; className?: string }) {
  const { t } = useTranslation()
  return (
    <SegmentedControl
      legend={t('reports.view.legend')}
      options={views.map((each) => ({ value: each, label: t(`reports.view.${each}`) }))}
      value={view}
      onChange={onChange}
      className={className}
    />
  )
}
