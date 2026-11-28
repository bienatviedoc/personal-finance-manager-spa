import { describe, expect, it } from 'vitest'
import { csvText } from '@/shared/lib/csv'
import { numberColumn, reportCsvFile } from './reportCsv'

describe('A report as CSV', () => {
  it('writes each figure of a number column as the number the API wrote, below zero too, and guards text in the others', () => {
    const { columns, rows } = reportCsvFile({
      name: 'net-worth',
      columns: ['row', numberColumn('netWorth'), numberColumn('notConverted'), 'currency'],
      rows: [
        ['-3', '-4300000.00', 2, 'VND'],
        ['=total', null, undefined, 'VND'],
      ],
    })

    expect(csvText(columns, rows)).toBe("row,netWorth,notConverted,currency\r\n'-3,-4300000.00,2,VND\r\n'=total,,,VND\r\n")
  })
})
