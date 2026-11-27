import { saveFile } from './saveFile'

/** What a CSV field can hold: text as written, a number or a flag as JavaScript writes it, nothing for a missing value. */
export type CsvValue = string | number | boolean | null | undefined

/**
 * CSV as RFC 4180 writes it, and as the API writes its own (its `Csv`): a line of column names, then a line for
 * each row, comma-separated and ended by CRLF; a field that holds a comma, a quote or a line break is quoted,
 * a quote inside doubled. Text that starts with `=`, `+`, `-`, `@`, a tab or a carriage return (a payee an
 * imported statement brought in, say) is written behind a single quote, so a spreadsheet shows it rather than runs
 * it as a formula (OWASP, CSV injection). A number is not, whether it is one or is written as the API writes an
 * amount (`-55000.00`), so an amount below zero stays a number.
 */
export function csvText(columns: readonly string[], rows: readonly (readonly CsvValue[])[]) {
  return [columns, ...rows].map((row) => row.map(field).join(',') + '\r\n').join('')
}

function field(value: CsvValue) {
  const text = value === null || value === undefined ? '' : typeof value === 'string' ? neutralised(value) : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** Text as a spreadsheet shows it: behind a single quote when it starts as a formula would, unless it is a plain decimal number. */
function neutralised(text: string) {
  return /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text) ? `'${text}` : text
}

/**
 * Hands the browser a CSV file to save: UTF-8 with a byte order mark, which tells a spreadsheet that its
 * Vietnamese text is not in the computer's own code page.
 */
export function saveCsv(name: string, columns: readonly string[], rows: readonly (readonly CsvValue[])[]) {
  saveFile(new Blob(['\u{FEFF}', csvText(columns, rows)], { type: 'text/csv;charset=utf-8' }), name)
}
