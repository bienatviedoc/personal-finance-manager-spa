import type { ParseKeys } from 'i18next'
import { useTranslation } from 'react-i18next'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { FailureToast } from '@/shared/components/FailureToast'
import { sameAmount } from '@/shared/money'
import { Button } from '@/shared/ui/button'
import type { Transaction } from '../api/transactions'
import { useMarkAsTransfer } from '../api/transfers'

/** The expense and the income among what was picked: the two legs it would become. */
type Legs = { expense: Transaction | undefined; income: Transaction | undefined }

const legsOf = (picked: Transaction[]): Legs => ({
  expense: picked.find((transaction) => transaction.type === 'expense'),
  income: picked.find((transaction) => transaction.type === 'income'),
})

/**
 * Why the picked transactions cannot be marked as a transfer, or null when they can: the API's rules (see
 * `Transfer.Mark` in the API) repeated for fast feedback only, as the API checks them again.
 */
function whyNot(count: number, { expense, income }: Legs): ParseKeys | null {
  if (count !== 2 || !expense || !income) return 'transfers.whyNot.types'
  if (expense.accountId === income.accountId) return 'transfers.whyNot.sameAccount'
  if (expense.date !== income.date) return 'transfers.whyNot.date'
  if (expense.currency === income.currency && !sameAmount(expense.amount, income.amount)) return 'transfers.whyNot.amount'
  return null
}

type Props = {
  /** What the user picked, as the list has it now. */
  picked: Transaction[]
  onClear: () => void
}

/**
 * Marks an expense and income the user picked in the list as one transfer (spec IMP-7), such as the two rows
 * imported statements show for paying a card. Says why it cannot while the two picked break a rule of a
 * transfer. Nothing is matched automatically.
 */
export function MarkAsTransfer({ picked, onClear }: Props) {
  const { t } = useTranslation()
  const mark = useMarkAsTransfer()
  const { expense, income } = legsOf(picked)
  const reason = whyNot(picked.length, { expense, income })
  const send = () => expense && income && mark.mutate({ expenseId: expense.id, incomeId: income.id }, { onSuccess: (outcome) => outcome.saved && onClear() })

  return (
    <section aria-label={t('transfers.markTitle')} className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
      <p className="text-muted-foreground">{t('transfers.markExplained')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={reason !== null || mark.isPending} onClick={send}>
          {t('transfers.markAs')}
        </Button>
        <Button size="sm" variant="outline" onClick={onClear}>
          {t('transfers.clearPicked')}
        </Button>
      </div>
      {reason && <p>{t(reason)}</p>}
      {mark.data?.saved === false && <ErrorMessage>{t('transfers.errors.markRefused')}</ErrorMessage>}
      <FailureToast failed={mark.isError} message={t('transfers.errors.notMarked')} retry={send} onDismiss={mark.reset} />
    </section>
  )
}
