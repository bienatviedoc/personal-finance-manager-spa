import { type DecimalString, decimalPattern } from './currencies'

/**
 * What is left of an amount after its parts, as a decimal string with no zeros it does not need:
 * `remainingAmount('500000.00', ['320000'])` is `"180000"`, and it is negative when the parts come to more.
 * This is what a form shows while an amount is split across lines. It works on the digits, never through a
 * JavaScript `number`, so `0.1` and `0.2` leave nothing of `0.3`. The API checks the sum again.
 */
export function remainingAmount(amount: DecimalString, parts: readonly DecimalString[]): DecimalString {
  const all = [amount, ...parts]
  // The message leaves out the amounts: error reports must not carry financial content.
  if (!all.every((each) => decimalPattern.test(each))) throw new Error('remainingAmount expects decimal strings such as "125000.00".')

  const decimals = Math.max(...all.map((each) => (each.split('.')[1] ?? '').length))
  const [whole, ...taken] = all.map((each) => scaled(each, decimals))
  const remaining = taken.reduce((left, part) => left - part, whole!)

  const digits = (remaining < 0n ? -remaining : remaining).toString().padStart(decimals + 1, '0')
  const integer = digits.slice(0, digits.length - decimals)
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/, '')
  return `${remaining < 0n ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`
}

/** The amount as a whole number of its smallest decimal: `"12.5"` with two decimals is `1250n`. */
function scaled(amount: DecimalString, decimals: number): bigint {
  const [integer, fraction = ''] = amount.split('.')
  return BigInt(integer + fraction.padEnd(decimals, '0'))
}
