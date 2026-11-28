import { saveFile } from './saveFile'

/**
 * A number already written as text (an amount as the API answers it, `-55000.00`), to be written as a number, never
 * as text: the API's `Csv.Number`. Made by {@link csvNumber}.
 */
export class CsvNumber {
  readonly text: string

  constructor(text: string) {
    this.text = text
  }
}

/** A number from the API, as a number of the file: an amount kept as the API writes it, nothing for a missing one. */
export function csvNumber(value: number | string | null | undefined) {
  return value === null || value === undefined ? null : new CsvNumber(String(value))
}

/**
 * What a CSV field can hold: text as written, a number or a flag as JavaScript writes it, a number the API wrote
 * ({@link csvNumber}), nothing for a missing value.
 */
export type CsvValue = string | number | boolean | CsvNumber | null | undefined

/**
 * CSV as RFC 4180 writes it, and as the API writes its own (its `Csv`): a line of column names, then a line for
 * each row, comma-separated and ended by CRLF; a field that holds a comma, a quote or a line break is quoted,
 * a quote inside doubled. Text that starts with `=`, `+`, `-`, `@`, a tab or a carriage return (a payee an
 * imported statement brought in, say) is written behind a single quote, so a spreadsheet shows it rather than runs
 * it as a formula (OWASP, CSV injection). Every string is text, even one that looks like a number (a payee typed as
 * `-3`); only a number is left alone, a JavaScript one or one the API wrote, passed as {@link csvNumber}, so an
 * amount below zero stays a number. The API's `Csv` applies the same rule.
 */
export function csvText(columns: readonly string[], rows: readonly (readonly CsvValue[])[]) {
  return [columns, ...rows].map((row) => row.map(field).join(',') + '\r\n').join('')
}

function field(value: CsvValue) {
  const text =
    value === null || value === undefined ? '' : typeof value === 'string' ? neutralised(value) : value instanceof CsvNumber ? value.text : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** Text as a spreadsheet shows it: behind a single quote when it starts as a formula would. */
function neutralised(text: string) {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
}

/**
 * Hands the browser a CSV file to save: UTF-8 with a byte order mark, which tells a spreadsheet that its
 * Vietnamese text is not in the computer's own code page.
 */
export function saveCsv(name: string, columns: readonly string[], rows: readonly (readonly CsvValue[])[]) {
  saveFile(new Blob(['\u{FEFF}', csvText(columns, rows)], { type: 'text/csv;charset=utf-8' }), name)
}
