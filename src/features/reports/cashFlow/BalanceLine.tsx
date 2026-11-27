import { LineChart } from '@/shared/charts'
import { formatDate } from '@/shared/dates'
import { useLocale } from '@/shared/i18n/useLocale'
import { formatAxisAmount } from '@/shared/money'
import type { CashFlow } from '../api/cashFlow'

/** The one line of the chart. */
const balance = { key: 'balance', color: 'var(--chart-1)' }

/** The running balance drawn as one line over the days it is shown at. The numbers are in the table view. */
export function BalanceLine({ cashFlow, label }: { cashFlow: CashFlow; label: string }) {
  const locale = useLocale()
  return (
    <LineChart
      label={label}
      points={cashFlow.items.map((item) => formatDate(item.date, locale))}
      series={[{ ...balance, values: cashFlow.items.map((item) => Number(item.balance)) }]}
      formatValue={(value) => formatAxisAmount(value, locale)}
    />
  )
}
