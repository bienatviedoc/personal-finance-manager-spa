import type { ParseKeys } from 'i18next'
import { useTranslation } from 'react-i18next'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { FailureToast } from '@/shared/components/FailureToast'
import { Button } from '@/shared/ui/button'
import type { Transaction } from '../api/transactions'
import { useMarkAsTransfer } from '../api/transfers'

/** An amount's digits without the zeros that end its decimals, so 100.00 and 100 read the same. Nothing is added up. */
const digitsOf = (amount: string) => (amount.includes('.') ? amount.replace(/\.?0+$/, '') : amount)

/**
 * Why the picked transactions cannot be marked as a transfer, or null when they can: the API's rules (see
 * `Transfer.Mark` in the API) repeated for fast feedback only, as the API checks them again.
 */
function whyNot(picked: Transaction[]): ParseKeys | null {
  const expense = picked.find((transaction) => transaction.type === 'expense')
  const income = picked.find((transaction) => transaction.type === 'income')
  if (picked.length !== 2 || !expense || !income) return 'transfers.whyNot.types'
  if (expense.accountId === income.accountId) return 'transfers.whyNot.sameAccount'
  if (expense.date !== income.date) return 'transfers.whyNot.date'
  if (expense.currency === income.currency && digitsOf(expense.amount) !== digitsOf(income.amount)) return 'transfers.whyNot.amount'
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
  const reason = whyNot(picked)
  const expense = picked.find((transaction) => transaction.type === 'expense')
  const income = picked.find((transaction) => transaction.type === 'income')
  const send = () => expense && income && mark.mutate({ expenseId: expense.id, incomeId: income.id }, { onSuccess: (outcome) => outcome.marked && onClear() })

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
      {mark.data?.marked === false && <ErrorMessage>{t('transfers.errors.markRefused')}</ErrorMessage>}
      <FailureToast failed={mark.isError} message={t('transfers.errors.notMarked')} retry={send} onDismiss={mark.reset} />
    </section>
  )
}
