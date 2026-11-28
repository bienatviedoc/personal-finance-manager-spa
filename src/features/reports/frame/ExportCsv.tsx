import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { saveCsv } from '@/shared/lib/csv'
import { Button } from '@/shared/ui/button'
import { reportCsvFile, type ReportCsv } from './reportCsv'
import type { ReportFilters } from './useReportFilters'

/**
 * Downloads what a report shows as CSV (spec section 7, Export): the numbers of its table view, from the answer
 * already on screen, whichever view is shown, named for the report and the period of its filters. Nothing is
 * asked of the API again.
 */
export function ExportCsv({ csv, filters }: { csv: ReportCsv; filters: ReportFilters }) {
  const { t } = useTranslation()
  const save = () => {
    const { columns, rows } = reportCsvFile(csv)
    saveCsv(`${csv.name}-${filters.from}-${filters.to}.csv`, columns, rows)
  }

  return (
    <Button variant="outline" className="w-fit" onClick={save}>
      <Download aria-hidden />
      {t('reports.export')}
    </Button>
  )
}
