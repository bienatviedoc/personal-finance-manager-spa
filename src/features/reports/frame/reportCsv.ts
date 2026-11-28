import { csvNumber, type CsvValue } from '@/shared/lib/csv'

/** A column of figures the API answers: every value in it is written as a number, never as text. Made by {@link numberColumn}. */
export type NumberColumn = { readonly name: string; readonly number: true }

/** A column of a report's file: its name, the API's name for what the table shows, or a {@link NumberColumn}. */
export type ReportColumn = string | NumberColumn

/** A column of the figures the API answers, amounts as plain decimals beside a currency column: written as numbers. */
export function numberColumn(name: string): NumberColumn {
  return { name, number: true }
}

/** What a report downloads as CSV. */
export type ReportCsv = {
  /** What the file is named for, before its period: `net-worth` saves `net-worth-2026-01-01-2026-03-31.csv`. */
  name: string
  /**
   * The columns, by the API's names for what the table shows. A column of the API's figures is a
   * {@link numberColumn}, so what is in it is written as a number, as the API wrote it (`-55000.00`); everything else
   * that is a string is text, and guarded (see `csvText`).
   */
  columns: readonly ReportColumn[]
  /**
   * The table view, a row each, a value for each column. Nothing in them is translated, so a file is the same in every
   * language: a report with rows of more than one kind starts each with a `row` column, a fixed code saying what it is
   * (`month`, `total`, `unbudgeted`), and names only what the user named (a category, an account), left empty on a
   * total.
   */
  rows: readonly (readonly CsvValue[])[]
}

/** The column names and rows to write: each value of a number column as a number, the rest as they are. */
export function reportCsvFile(csv: ReportCsv) {
  const isNumber = csv.columns.map((column) => typeof column !== 'string')
  return {
    columns: csv.columns.map((column) => (typeof column === 'string' ? column : column.name)),
    rows: csv.rows.map((row) => row.map((value, index) => (isNumber[index] && (typeof value === 'string' || typeof value === 'number') ? csvNumber(value) : value))),
  }
}
