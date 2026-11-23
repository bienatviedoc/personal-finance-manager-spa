import { describe, expect, it } from 'vitest'
import { isZeroAmount, signedAmount } from './currencies'

describe('isZeroAmount', () => {
  it.each(['0', '0.00', '0.0000', '-0.00', '000'])('reads %s as zero', (amount) => {
    expect(isZeroAmount(amount)).toBe(true)
  })

  it.each(['0.01', '-0.50', '10', '100.00', '-200000.00', '9007199254740993.01'])('reads %s as not zero', (amount) => {
    expect(isZeroAmount(amount)).toBe(false)
  })
})

describe('signedAmount', () => {
  it('puts a minus in front of an amount that takes money away, and leaves one that adds alone', () => {
    expect(signedAmount('125000.00', true)).toBe('-125000.00')
    expect(signedAmount('125000.00', false)).toBe('125000.00')
  })
})
