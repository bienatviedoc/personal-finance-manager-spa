import { useLocale } from '@/shared/i18n/useLocale'
import type { Currency, DecimalString } from './currencies'
import { formatMoney } from './formatMoney'

type Props = {
  amount: DecimalString
  currency: Currency
  className?: string
  /** Writes a plus sign before an amount above zero too: a change, not an amount. */
  signed?: boolean
}

/** An amount of money, written in the interface's locale: the one way the app shows an amount. */
export function Money({ amount, currency, className, signed = false }: Props) {
  const locale = useLocale()
  return (
    <span className={className} data-amount={amount} data-currency={currency}>
      {formatMoney(amount, currency, locale, signed)}
    </span>
  )
}
