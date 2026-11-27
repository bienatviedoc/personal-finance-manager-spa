import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { maxSkippedStatementRows } from '@/shared/api/limits'
import { SelectField } from '@/shared/components/SelectField'
import { TextField } from '@/shared/components/TextField'
import { cn, focusRingWithin } from '@/shared/lib/utils'
import type { Mapping } from '../api/imports'

export type ColumnChoice = { value: string; label: string }

const separators = ['comma', 'semicolon', 'tab', 'pipe'] as const
const dateFormats = ['dayMonthYear', 'monthDayYear', 'yearMonthDay'] as const
const decimalSeparators = ['dot', 'comma'] as const
const amountChoices = ['one', 'separate'] as const

type Props = {
  mapping: Mapping
  onChange: (mapping: Mapping) => void
  /** The file's columns, named by its header row when it has one. */
  columns: ColumnChoice[]
  /** Whether the amounts are in a debit and a credit column rather than one signed column. */
  separate: boolean
  onSeparateChange: (separate: boolean) => void
}

/**
 * How to read the statement (see the glossary, mapping): what separates its cells, the rows before and after the
 * transactions, whether a row names the columns, which column is which, and how dates and amounts are written.
 * Every choice is the user's: no bank's layout is built in (spec section 15). Each change previews the file again.
 */
export function MappingForm({ mapping, onChange, columns, separate, onSeparateChange }: Props) {
  const { t } = useTranslation()
  const amountsName = useId()
  const set = (change: Partial<Mapping>) => onChange({ ...mapping, ...change })
  const column = (value: string) => (value === '' ? null : Number(value))
  const rows = (value: string) => Math.max(0, Math.min(maxSkippedStatementRows, Number.parseInt(value, 10) || 0))
  const choose = [{ value: '', label: t('imports.mapping.chooseColumn') }, ...columns]

  return (
    <fieldset className="space-y-4 rounded-lg border p-4">
      <legend className="px-1 text-lg font-semibold">{t('imports.mapping.title')}</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label={t('imports.mapping.separator')}
          options={separators.map((value) => ({ value, label: t(`imports.mapping.separators.${value}`) }))}
          value={mapping.separator}
          onChange={(event) => set({ separator: event.target.value as Mapping['separator'] })}
        />
        <TextField
          type="number"
          min={0}
          max={maxSkippedStatementRows}
          label={t('imports.mapping.skipFirstRows')}
          hint={t('imports.mapping.skipFirstRowsHint')}
          value={mapping.skipFirstRows}
          onChange={(event) => set({ skipFirstRows: rows(event.target.value) })}
        />
        <label className={cn('flex items-center gap-2 text-sm sm:col-span-2', focusRingWithin)}>
          <input type="checkbox" className="size-4" checked={mapping.hasHeaderRow} onChange={(event) => set({ hasHeaderRow: event.target.checked })} />
          {t('imports.mapping.hasHeaderRow')}
        </label>
        <TextField
          type="number"
          min={0}
          max={maxSkippedStatementRows}
          label={t('imports.mapping.skipLastRows')}
          hint={t('imports.mapping.skipLastRowsHint')}
          value={mapping.skipLastRows}
          onChange={(event) => set({ skipLastRows: rows(event.target.value) })}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label={t('imports.mapping.dateColumn')} options={choose} value={mapping.dateColumn ?? ''} onChange={(event) => set({ dateColumn: column(event.target.value) })} />
        <SelectField
          label={t('imports.mapping.descriptionColumn')}
          options={[{ value: '', label: t('imports.mapping.noDescription') }, ...columns]}
          value={mapping.descriptionColumn ?? ''}
          onChange={(event) => set({ descriptionColumn: column(event.target.value) })}
        />
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t('imports.mapping.amounts')}</legend>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {amountChoices.map((choice) => (
            <label
              key={choice}
              className={cn(
                'cursor-pointer rounded-md px-3 py-1.5 text-center text-sm font-medium text-muted-foreground has-checked:bg-background has-checked:text-foreground has-checked:shadow-sm',
                focusRingWithin,
              )}
            >
              <input
                type="radio"
                name={amountsName}
                className="sr-only"
                checked={(choice === 'separate') === separate}
                onChange={() => {
                  onSeparateChange(choice === 'separate')
                  set({ amountColumn: null, debitColumn: null, creditColumn: null })
                }}
              />
              {t(`imports.mapping.amountChoices.${choice}`)}
            </label>
          ))}
        </div>
        {separate ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label={t('imports.mapping.debitColumn')} options={choose} value={mapping.debitColumn ?? ''} onChange={(event) => set({ debitColumn: column(event.target.value) })} />
            <SelectField label={t('imports.mapping.creditColumn')} options={choose} value={mapping.creditColumn ?? ''} onChange={(event) => set({ creditColumn: column(event.target.value) })} />
          </div>
        ) : (
          <SelectField
            label={t('imports.mapping.amountColumn')}
            hint={t('imports.mapping.amountColumnHint')}
            options={choose}
            value={mapping.amountColumn ?? ''}
            onChange={(event) => set({ amountColumn: column(event.target.value) })}
          />
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label={t('imports.mapping.dateFormat')}
          options={dateFormats.map((value) => ({ value, label: t(`imports.mapping.dateFormats.${value}`) }))}
          value={mapping.dateFormat}
          onChange={(event) => set({ dateFormat: event.target.value as Mapping['dateFormat'] })}
        />
        <SelectField
          label={t('imports.mapping.decimalSeparator')}
          options={decimalSeparators.map((value) => ({ value, label: t(`imports.mapping.decimalSeparators.${value}`) }))}
          value={mapping.decimalSeparator}
          onChange={(event) => set({ decimalSeparator: event.target.value as Mapping['decimalSeparator'] })}
        />
      </div>
    </fieldset>
  )
}
