import { useTranslation } from 'react-i18next'
import { inCurrencyOrder, Money } from '@/shared/money'
import type { FilteredTotal } from '../api/transactions'

/**
 * What the transactions that pass the filters come to (spec TXN-3): all of them, not only the rows loaded so
 * far. The API adds them up, each currency on its own; nothing is added here. The legs of a transfer are
 * counted and are in neither income nor expenses. Filtered by a category, it first says what they spent there in
 * the base currency, as that category's budget counts it (spec BUD-8): the one figure that is the budget's spent.
 * The totals in each currency follow under their own caption, as they are not converted and need not match it.
 */
export function TransactionTotal({ total }: { total: FilteredTotal }) {
  const { t } = useTranslation()

  return (
    <section aria-label={t('transactions.total.title')} className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
      <p className="font-medium">{t('transactions.total.count', { count: total.count })}</p>
      {total.spent && (
        <div className="space-y-1 border-b pb-2">
          <dl className="flex flex-wrap gap-1.5 tabular-nums">
            <dt className="text-muted-foreground">{t('transactions.total.spent')}</dt>
            <dd className="font-medium">
              <Money amount={total.spent.amount} currency={total.spent.currency} />
            </dd>
          </dl>
          {Number(total.spent.notConverted) > 0 && (
            <p role="note" className="font-medium">
              {t('budgets.notConverted', { count: Number(total.spent.notConverted) })}
            </p>
          )}
        </div>
      )}
      {total.spent && total.currencies.length > 0 && <p className="text-muted-foreground">{t('transactions.total.byCurrency')}</p>}
      {total.currencies.toSorted(inCurrencyOrder).map(({ currency, income, expenses, net }) => (
        <div key={currency} className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="w-10 font-medium text-muted-foreground">{currency}</span>
          <dl className="flex flex-1 flex-wrap gap-x-4 gap-y-1 tabular-nums">
            {amounts(income, expenses, net).map(({ name, amount }) => (
              <div key={name} className="flex gap-1.5">
                <dt className="text-muted-foreground">{t(`transactions.total.${name}`)}</dt>
                <dd className={name === 'net' ? 'font-medium' : undefined}>
                  <Money amount={amount} currency={currency} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </section>
  )
}

/** The three amounts of a currency, in the order they are shown, each under the name its label is translated by. */
const amounts = (income: string, expenses: string, net: string) =>
  [
    { name: 'income', amount: income },
    { name: 'expenses', amount: expenses },
    { name: 'net', amount: net },
  ] as const
