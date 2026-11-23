import { describe, expect, it } from 'vitest'
import { remainingAmount } from './remainingAmount'

describe('remainingAmount', () => {
  it.each([
    ['500000', ['320000', '180000'], '0'],
    ['500000.00', ['320000'], '180000'],
    ['500000', ['320000', '200000'], '-20000'],
    ['500000', [], '500000'],
    ['100', ['33.33', '33.33'], '33.34'],
    ['100.00', ['33.33', '33.33', '33.34'], '0'],
    ['0.3', ['0.1', '0.2'], '0'],
    ['10', ['9.9999'], '0.0001'],
    ['999999999999999.99', ['0.01'], '999999999999999.98'],
    ['1', ['1.5'], '-0.5'],
  ])('%s less %j leaves %s, exactly', (amount, parts, remaining) => {
    expect(remainingAmount(amount, parts)).toBe(remaining)
  })

  it('refuses anything that is not a decimal string, without repeating it', () => {
    expect(() => remainingAmount('1,5', [])).toThrow('remainingAmount expects decimal strings such as "125000.00".')
  })
})
