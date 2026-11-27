import type { ParseKeys } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/shared/dates'
import { useLocale } from '@/shared/i18n/useLocale'
import { Money, signedAmount } from '@/shared/money'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import type { ImportPreview, PreviewRow } from '../api/imports'
import type { ColumnChoice } from './MappingForm'

/** How many rows of the preview a page shows: a statement may have 10,000, too many to put on the screen at once. */
const previewPageSize = 100

/** How many rows of the file the raw view shows, so a long statement does not fill the screen before it is mapped. */
const rawRowsShown = 30

/** The file as uploaded, cut into cells, for the user to see which column is which before mapping them. */
export function RawRows({ preview, columns }: { preview: ImportPreview; columns: ColumnChoice[] }) {
  const { t } = useTranslation()
  const shown = preview.rows.slice(0, rawRowsShown)

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border">
        <table aria-label={t('imports.rawTable')} className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th scope="col" className="p-2 font-medium">
                {t('imports.preview.row')}
              </th>
              {columns.map((column) => (
                <th key={column.value} scope="col" className="p-2 font-medium">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.map((row) => (
              <tr key={row.number} className={cn(row.kind !== 'unmapped' && 'text-muted-foreground')}>
                <td className="p-2 tabular-nums">{row.number}</td>
                {columns.map((column, index) => (
                  <td key={column.value} className="p-2 break-words">
                    {row.cells[index] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {preview.rows.length > rawRowsShown && <p className="text-sm text-muted-foreground">{t('imports.rawMore', { shown: rawRowsShown, count: preview.rows.length })}</p>}
    </div>
  )
}

type Props = {
  preview: ImportPreview
  /** The numbers of the rows ticked to import. */
  selection: ReadonlySet<number>
  onToggle: (row: number) => void
}

/**
 * Every row of the statement as the mapping reads it (spec IMP-1): a transaction, ticked to import unless it is a
 * likely duplicate (IMP-3), or a row that cannot be read with why, which is never imported, or one passed over. The
 * API answers every row at once; the table shows them a page at a time, and what is ticked is kept by the screen
 * around it, so it stays as it was from page to page. A new preview starts again at the first page.
 */
export function PreviewTable({ preview, selection, onToggle }: Props) {
  const { t } = useTranslation()
  const locale = useLocale()
  const [page, setPage] = useState<{ preview: ImportPreview; index: number } | null>(null)
  const index = page?.preview === preview ? page.index : 0
  const pages = Math.max(1, Math.ceil(preview.rows.length / previewPageSize))
  const shown = preview.rows.slice(index * previewPageSize, (index + 1) * previewPageSize)
  const goTo = (next: number) => setPage({ preview, index: next })

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border">
        <table aria-label={t('imports.previewTable')} className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th scope="col" className="p-2 font-medium">
                <span className="sr-only">{t('imports.preview.import')}</span>
              </th>
              <th scope="col" className="p-2 font-medium">
                {t('imports.preview.row')}
              </th>
              <th scope="col" className="p-2 font-medium">
                {t('imports.preview.date')}
              </th>
              <th scope="col" className="p-2 font-medium">
                {t('imports.preview.description')}
              </th>
              <th scope="col" className="p-2 text-right font-medium">
                {t('imports.preview.amount')}
              </th>
              <th scope="col" className="p-2 font-medium">
                {t('imports.preview.status')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.map((row) => (
              <tr key={row.number} className={cn(row.kind !== 'parsed' && 'text-muted-foreground', row.kind === 'failed' && 'bg-destructive/5')}>
                <td className="p-2">
                  {row.kind === 'parsed' && (
                    <input
                      type="checkbox"
                      className="size-4"
                      aria-label={t('imports.preview.importRow', { number: row.number })}
                      checked={selection.has(Number(row.number))}
                      onChange={() => onToggle(Number(row.number))}
                    />
                  )}
                </td>
                <td className="p-2 tabular-nums">{row.number}</td>
                <td className="p-2 whitespace-nowrap">{row.date && formatDate(row.date, locale)}</td>
                <td className="p-2 break-words">{row.kind === 'parsed' ? row.description : row.cells.filter((cell) => cell.trim() !== '').join(' · ')}</td>
                <td className="p-2 text-right whitespace-nowrap tabular-nums">
                  {row.amount && <Money amount={signedAmount(row.amount, row.type === 'expense')} currency={preview.currency} />}
                </td>
                <td className="p-2">
                  <RowStatus row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav aria-label={t('imports.preview.pages')} className="flex flex-wrap items-center gap-2 text-sm">
          <Button type="button" variant="outline" size="sm" disabled={index === 0} onClick={() => goTo(index - 1)}>
            {t('imports.preview.previous')}
          </Button>
          <span aria-live="polite" className="tabular-nums">
            {t('imports.preview.page', { from: index * previewPageSize + 1, to: index * previewPageSize + shown.length, count: preview.rows.length })}
          </span>
          <Button type="button" variant="outline" size="sm" disabled={index === pages - 1} onClick={() => goTo(index + 1)}>
            {t('imports.preview.next')}
          </Button>
        </nav>
      )}
    </div>
  )
}

const kindLabels: Record<PreviewRow['kind'], ParseKeys | null> = {
  parsed: null,
  failed: null,
  unmapped: null,
  skipped: 'imports.preview.kinds.skipped',
  header: 'imports.preview.kinds.header',
  blank: 'imports.preview.kinds.blank',
}

/** What a row is, in words: a likely duplicate, why it cannot be read, or that it is passed over. */
function RowStatus({ row }: { row: PreviewRow }) {
  const { t } = useTranslation()
  if (row.likelyDuplicate) return <span className="font-medium text-warning">{t('imports.preview.likelyDuplicate')}</span>
  if (row.kind === 'failed' && row.problem) return <span className="text-destructive">{t(`imports.problems.${row.problem}`)}</span>
  const label = kindLabels[row.kind]
  return label ? t(label) : null
}
