import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { cn, focusRingWithin } from '@/shared/lib/utils'
import type { ReportView } from './useReportFilters'

/** Chart or table: the same numbers either way (spec section 7, "every chart has a table view"). */
export function ViewToggle({ view, onChange, className }: { view: ReportView; onChange: (view: ReportView) => void; className?: string }) {
  const { t } = useTranslation()
  // Each toggle's radios are a group of their own, however many are on the page.
  const name = useId()
  const views: ReportView[] = ['chart', 'table']

  return (
    <fieldset className={className}>
      <legend className="sr-only">{t('reports.view.legend')}</legend>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {views.map((each) => (
          <label
            key={each}
            className={cn(
              'cursor-pointer rounded-md px-3 py-1 text-center text-sm font-medium text-muted-foreground has-checked:bg-background has-checked:text-foreground has-checked:shadow-sm',
              focusRingWithin,
            )}
          >
            <input type="radio" name={name} value={each} checked={view === each} onChange={() => onChange(each)} className="sr-only" />
            {t(`reports.view.${each}`)}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
