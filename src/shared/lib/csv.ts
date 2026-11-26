import { saveFile } from './saveFile'

/** What a CSV field can hold: text as written, a number or a flag as JavaScript writes it, nothing for a missing value. */
export type CsvValue = string | number | boolean | null | undefined

/**
 * CSV as RFC 4180 writes it, and as the API writes its own (its `Csv`): a line of column names, then a line for
 * each row, comma-separated and ended by CRLF; a field that holds a comma, a quote or a line break is quoted,
 * a quote inside doubled.
 */
export function csvText(columns: readonly string[], rows: readonly (readonly CsvValue[])[]) {
  return [columns, ...rows].map((row) => row.map(field).join(',') + '\r\n').join('')
}

function field(value: CsvValue) {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/**
 * Hands the browser a CSV file to save: UTF-8 with a byte order mark, which tells a spreadsheet that its
 * Vietnamese text is not in the computer's own code page.
 */
export function saveCsv(name: string, columns: readonly string[], rows: readonly (readonly CsvValue[])[]) {
  saveFile(new Blob(['\u{FEFF}', csvText(columns, rows)], { type: 'text/csv;charset=utf-8' }), name)
}
