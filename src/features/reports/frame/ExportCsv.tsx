import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { saveCsv, type CsvValue } from '@/shared/lib/csv'
import { Button } from '@/shared/ui/button'
import type { ReportFilters } from './useReportFilters'

type Props = {
  /** What the file is named for, before its period: `spending-by-category` saves `spending-by-category-2026-03-01-2026-03-31.csv`. */
  name: string
  /** The filters the report is shown with: the file is named for their period. */
  filters: ReportFilters
  /** The names of the columns, the API's names for what the table shows. */
  columns: readonly string[]
  /** The numbers of the table view, a row each: amounts as the API answers them, plain decimals, beside a currency column. */
  rows: readonly (readonly CsvValue[])[]
}

/**
 * Downloads what a report shows as CSV (spec section 7, Export): the numbers of its table view, from the answer
 * already on screen, whichever view is shown. Nothing is asked of the API again.
 */
export function ExportCsv({ name, filters, columns, rows }: Props) {
  const { t } = useTranslation()

  return (
    <Button variant="outline" className="w-fit" onClick={() => saveCsv(`${name}-${filters.from}-${filters.to}.csv`, columns, rows)}>
      <Download aria-hidden />
      {t('reports.export')}
    </Button>
  )
}
