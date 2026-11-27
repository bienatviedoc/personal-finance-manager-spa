import { describe, expect, it } from 'vitest'
import { csvText } from './csv'

describe('CSV', () => {
  it('is a line of column names and a line for each row, comma-separated and ended by CRLF', () => {
    expect(csvText(['category', 'spent'], [['Transport', '200000.00'], ['Food', '80.5']])).toBe('category,spent\r\nTransport,200000.00\r\nFood,80.5\r\n')
  })

  it('quotes a field that holds a comma, a quote or a line break, doubling a quote inside (RFC 4180)', () => {
    expect(csvText(['payee'], [['Travel, card'], ['Bánh mì "Huỳnh Hoa"'], ['two\nlines']])).toBe('payee\r\n"Travel, card"\r\n"Bánh mì ""Huỳnh Hoa"""\r\n"two\nlines"\r\n')
  })

  it('puts a single quote before text a spreadsheet would run as a formula (OWASP, CSV injection)', () => {
    expect(csvText(['payee'], [['=HYPERLINK("http://evil.example")'], ['+1+2'], ['-2+3'], ['@SUM(A1)'], ['\tTAB'], ['\rCR'], ['Phở = good']])).toBe(
      'payee\r\n"\'=HYPERLINK(""http://evil.example"")"\r\n\'+1+2\r\n\'-2+3\r\n\'@SUM(A1)\r\n\'\tTAB\r\n"\'\rCR"\r\nPhở = good\r\n',
    )
  })

  it('writes an amount below zero as the number it is, whether it comes as a number or as the API writes it', () => {
    expect(csvText(['change', 'net'], [['-55000.00', -12.5], ['-3', 0]])).toBe('change,net\r\n-55000.00,-12.5\r\n-3,0\r\n')
  })

  it('writes nothing for a missing value, and true or false for a flag', () => {
    expect(csvText(['note', 'isRefund', 'share'], [[null, true, 42.5], [undefined, false, null]])).toBe('note,isRefund,share\r\n,true,42.5\r\n,false,\r\n')
  })
})
