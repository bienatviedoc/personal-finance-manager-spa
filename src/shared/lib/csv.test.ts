import { describe, expect, it } from 'vitest'
import { csvText } from './csv'

describe('CSV', () => {
  it('is a line of column names and a line for each row, comma-separated and ended by CRLF', () => {
    expect(csvText(['category', 'spent'], [['Transport', '200000.00'], ['Food', '80.5']])).toBe('category,spent\r\nTransport,200000.00\r\nFood,80.5\r\n')
  })

  it('quotes a field that holds a comma, a quote or a line break, doubling a quote inside (RFC 4180)', () => {
    expect(csvText(['payee'], [['Travel, card'], ['Bánh mì "Huỳnh Hoa"'], ['two\nlines']])).toBe('payee\r\n"Travel, card"\r\n"Bánh mì ""Huỳnh Hoa"""\r\n"two\nlines"\r\n')
  })

  it('writes nothing for a missing value, and true or false for a flag', () => {
    expect(csvText(['note', 'isRefund', 'share'], [[null, true, 42.5], [undefined, false, null]])).toBe('note,isRefund,share\r\n,true,42.5\r\n,false,\r\n')
  })
})
