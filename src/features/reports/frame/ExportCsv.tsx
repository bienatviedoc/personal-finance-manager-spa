import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { saveCsv, type CsvValue } from '@/shared/lib/csv'
import { Button } from '@/shared/ui/button'
import type { ReportFilters } from './useReportFilters'

/** What a report downloads as CSV. */
export type ReportCsv = {
  /** What the file is named for, before its period: `net-worth` saves `net-worth-2026-01-01-2026-03-31.csv`. */
  name: string
  /** The names of the columns, the API's names for what the table shows. */
  columns: readonly string[]
  /** The numbers of the table view, a row each: amounts as the API answers them, plain decimals, beside a currency column. */
  rows: readonly (readonly CsvValue[])[]
}

/**
 * Downloads what a report shows as CSV (spec section 7, Export): the numbers of its table view, from the answer
 * already on screen, whichever view is shown, named for the report and the period of its filters. Nothing is
 * asked of the API again.
 */
export function ExportCsv({ csv, filters }: { csv: ReportCsv; filters: ReportFilters }) {
  const { t } = useTranslation()
  const save = () => saveCsv(`${csv.name}-${filters.from}-${filters.to}.csv`, csv.columns, csv.rows)

  return (
    <Button variant="outline" className="w-fit" onClick={save}>
      <Download aria-hidden />
      {t('reports.export')}
    </Button>
  )
}
