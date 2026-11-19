import { useLocale } from '@/shared/i18n/useLocale'
import type { Currency, DecimalString } from './currencies'
import { formatMoney } from './formatMoney'

type Props = { amount: DecimalString; currency: Currency; className?: string }

/** An amount of money, written in the interface's locale: the one way the app shows an amount. */
export function Money({ amount, currency, className }: Props) {
  const locale = useLocale()
  return (
    <span className={className} data-amount={amount} data-currency={currency}>
      {formatMoney(amount, currency, locale)}
    </span>
  )
}
