import { useQuery } from '@tanstack/react-query'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { categoriesQuery, useCategoryChoices } from '@/features/categories'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { FailureToast } from '@/shared/components/FailureToast'
import { SelectField } from '@/shared/components/SelectField'
import { Button } from '@/shared/ui/button'
import { importPreviewQuery, useCommitImport, type CommitField, type ImportBatch, type ImportPreview, type Mapping, type PreviewRow } from '../api/imports'
import { isComplete } from './mapping'
import { MappingForm, type ColumnChoice } from './MappingForm'
import { PreviewTable, RawRows } from './PreviewTable'

/**
 * Mapping a statement and checking it before anything is saved (spec IMP-1, IMP-3): the mapping starts from the one
 * saved for the account (`fromSaved`, spec IMP-2), which the user can change, or else the API's guess at the layout; each change previews the file again, and the rows ticked to import start as every
 * transaction but the likely duplicates, each on the category a categorisation rule suggests for it, which the user may
 * change. Committing sends the mapping, the rows ticked, each row's own category, and a category for each way money
 * moves among the rows left without one. Those two start as the ones saved for the account with its mapping, so a
 * repeat import needs no choices.
 */
export function MapAndPreview({ batch, suggested, fromSaved = false }: { batch: ImportBatch; suggested: Mapping; fromSaved?: boolean }) {
  const { t } = useTranslation()
  const [mapping, setMapping] = useState(suggested)
  const [separate, setSeparate] = useState(suggested.debitColumn !== null)
  const preview = useQuery({ ...importPreviewQuery(batch.id, mapping), staleTime: Infinity })
  const complete = isComplete(mapping) && (separate ? mapping.amountColumn === null : mapping.amountColumn !== null)
  const columns = useColumns(preview.data)

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">{t('imports.mapIntro')}</p>
      {fromSaved && <p className="rounded-lg border bg-muted/40 p-3 text-sm">{t('imports.savedMapping')}</p>}
      <MappingForm mapping={mapping} onChange={setMapping} columns={columns} separate={separate} onSeparateChange={setSeparate} />
      {preview.isError && <ErrorMessage>{t('imports.errors.preview')}</ErrorMessage>}
      {preview.data &&
        (complete ? (
          <Check batch={batch} mapping={mapping} preview={preview.data} reading={preview.isPlaceholderData} />
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t('imports.mapFirst')}</p>
            <RawRows preview={preview.data} columns={columns} />
          </div>
        ))}
    </div>
  )
}

/** The file's columns, each named by the header row when it has one, else by its place. */
function useColumns(preview: ImportPreview | undefined): ColumnChoice[] {
  const { t } = useTranslation()
  return useMemo(
    () =>
      Array.from({ length: Number(preview?.columnCount ?? 0) }, (_, index) => ({
        value: String(index),
        label: preview?.header[index]?.trim() || t('imports.mapping.column', { number: index + 1 }),
      })),
    [preview, t],
  )
}

/**
 * The previewed rows to tick, what will and will not be imported, the categories, and committing. While `reading`,
 * the preview shown is of the mapping before, so nothing is committed until the new one answers.
 */
function Check({ batch, mapping, preview, reading }: { batch: ImportBatch; mapping: Mapping; preview: ImportPreview; reading: boolean }) {
  const { t } = useTranslation()
  const formId = useId()
  const commit = useCommitImport(batch.id)
  const categories = useQuery(categoriesQuery())
  const choices = useCategoryChoices(categories.data ?? [])
  // Ticked at first: every transaction but the likely duplicates. A new mapping is a new preview, and starts again.
  const [ticked, setTicked] = useState<{ preview: ImportPreview; rows: Set<number> } | null>(null)
  const selection = ticked?.preview === preview ? ticked.rows : new Set(preview.rows.filter((row) => row.selected).map((row) => Number(row.number)))
  // Each row starts on the category a categorisation rule suggests for it (spec IMP-4), '' for the batch's; the user may change any.
  const [picked, setPicked] = useState<{ preview: ImportPreview; categories: Map<number, string> } | null>(null)
  const rowCategories = picked?.preview === preview ? picked.categories : new Map<number, string>()
  const categoryOf = (row: PreviewRow) => rowCategories.get(Number(row.number)) ?? row.suggestedCategoryId ?? ''
  // Chosen by the user; until then, the ones saved for the account with its mapping (spec IMP-2), when they can still be chosen.
  const [expensePicked, setExpenseCategoryId] = useState<string | null>(null)
  const [incomePicked, setIncomeCategoryId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Partial<Record<CommitField, string>>>({})
  const [inProgress, setInProgress] = useState(false)

  const expenseChoices = choices.filter((choice) => choice.category.kind === 'expense').map((choice) => ({ value: choice.category.id, label: choice.label }))
  const incomeChoices = choices.filter((choice) => choice.category.kind === 'income').map((choice) => ({ value: choice.category.id, label: choice.label }))
  const offered = (saved: string | null | undefined, among: { value: string }[]) => (saved && among.some((choice) => choice.value === saved) ? saved : '')
  const expenseCategoryId = expensePicked ?? offered(batch.savedExpenseCategoryId, expenseChoices)
  const incomeCategoryId = incomePicked ?? offered(batch.savedIncomeCategoryId, incomeChoices)

  const chosen = preview.rows.filter((row) => selection.has(Number(row.number)))
  // The batch's categories are for the rows chosen without one of their own.
  const takesOut = chosen.some((row) => row.type === 'expense' && !categoryOf(row))
  const bringsIn = chosen.some((row) => row.type === 'income' && !categoryOf(row))
  const skippedDuplicates = preview.rows.filter((row) => row.likelyDuplicate && !selection.has(Number(row.number))).length

  const toggle = (number: number) => {
    const rows = new Set(selection)
    if (!rows.delete(number)) rows.add(number)
    setTicked({ preview, rows })
  }

  const pick = (number: number, categoryId: string) => setPicked({ preview, categories: new Map(rowCategories).set(number, categoryId) })
  const withOwnCategory = chosen.filter((row) => categoryOf(row) !== '').map((row) => ({ row: Number(row.number), categoryId: categoryOf(row) }))

  const onCommit = async () => {
    const found: Partial<Record<CommitField, string>> = {}
    if (takesOut && !expenseCategoryId) found.expenseCategoryId = t('imports.errors.expenseCategory')
    if (bringsIn && !incomeCategoryId) found.incomeCategoryId = t('imports.errors.incomeCategory')
    setErrors(found)
    if (Object.keys(found).length > 0) return
    // A request that failed is shown by the toast below.
    const outcome = await commit
      .mutateAsync({
        mapping,
        rows: chosen.map((row) => Number(row.number)),
        expenseCategoryId: takesOut ? expenseCategoryId : null,
        incomeCategoryId: bringsIn ? incomeCategoryId : null,
        // Sent only when a row has one, so a commit without any is as it always was.
        ...(withOwnCategory.length > 0 && { rowCategories: withOwnCategory }),
      })
      .catch(() => undefined)
    if (!outcome) return
    setInProgress(!outcome.saved && 'importInProgress' in outcome)
    if (!outcome.saved && 'fields' in outcome) {
      setErrors(Object.fromEntries(outcome.fields.map((field) => [field, t(`imports.errors.refused.${field}`)])))
    }
  }


  return (
    <div className="space-y-4">
      <ul aria-label={t('imports.summary.title')} className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
        <li className="font-medium">{t('imports.summary.toImport', { count: chosen.length })}</li>
        {skippedDuplicates > 0 && <li>{t('imports.summary.skippedDuplicates', { count: skippedDuplicates })}</li>}
        {Number(preview.counts.failed) > 0 && <li className="text-destructive">{t('imports.summary.failed', { count: preview.counts.failed })}</li>}
      </ul>

      <PreviewTable
        preview={preview}
        selection={selection}
        onToggle={toggle}
        categories={{ expense: expenseChoices, income: incomeChoices, of: categoryOf, onPick: pick }}
      />

      <form
        id={formId}
        noValidate
        aria-label={t('imports.commit')}
        className="space-y-4 rounded-lg border p-4"
        onSubmit={(event) => {
          event.preventDefault()
          void onCommit()
        }}
      >
        <p className="text-sm text-muted-foreground">{t('imports.categoriesIntro')}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={t('imports.expenseCategory')}
            options={[{ value: '', label: t('imports.chooseCategory') }, ...expenseChoices]}
            value={expenseCategoryId}
            onChange={(event) => setExpenseCategoryId(event.target.value)}
            error={errors.expenseCategoryId}
          />
          <SelectField
            label={t('imports.incomeCategory')}
            options={[{ value: '', label: t('imports.chooseCategory') }, ...incomeChoices]}
            value={incomeCategoryId}
            onChange={(event) => setIncomeCategoryId(event.target.value)}
            error={errors.incomeCategoryId}
          />
        </div>
        {(errors.rows ?? errors.rowCategories ?? errors.mapping ?? errors.id) && (
          <ErrorMessage>{errors.rows ?? errors.rowCategories ?? errors.mapping ?? errors.id}</ErrorMessage>
        )}
        {inProgress && <ErrorMessage>{t('imports.errors.importInProgress')}</ErrorMessage>}
        <Button type="submit" disabled={chosen.length === 0 || commit.isPending || reading}>
          {t('imports.importCount', { count: chosen.length })}
        </Button>
        <FailureToast failed={commit.isError} message={t('imports.errors.notCommitted')} retry={{ form: formId }} onDismiss={commit.reset} />
      </form>
    </div>
  )
}
