import { ArrowRightLeft, Lock } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Account } from '@/features/accounts'
import { CategoryBadge, findCategory, type Category } from '@/features/categories'
import { RecurringRuleLink } from '@/features/recurring'
import { FailureToast } from '@/shared/components/FailureToast'
import { formatDate } from '@/shared/dates'
import { useLocale } from '@/shared/i18n/useLocale'
import { detailSeparator, joinDetails } from '@/shared/lib/details'
import { cn } from '@/shared/lib/utils'
import { Money, signedAmount } from '@/shared/money'
import { Button } from '@/shared/ui/button'
import { isPending, isSplit, isTransferLeg, takesFromBalance, useDeleteTransaction, type ListedTransaction, type Transaction } from '../api/transactions'
import { useDeleteTransfer } from '../api/transfers'
import type { VirtualRow } from './VirtualRows'

type RowProps = {
  transaction: ListedTransaction
  account?: Account
  /** The transaction's category; of a split, its first line's. */
  category?: Category
  /** The user's category tree, to name the category of each line of a split. */
  categories: Category[]
  onEdit: (transaction: Transaction) => void
  /** Whether it is picked to mark as a transfer, and how to pick it or not; none when it cannot be. */
  pick?: { picked: boolean; onToggle: () => void }
  /** Where the list has the row, and how it measures it. */
  row: VirtualRow
}

/**
 * One transaction in the list: what it was for, on which account and when, its amount with its sign, a split's
 * lines, and editing and deleting it. A leg of a transfer is marked as one, and edits and deletes the transfer.
 * Income or an expense can be picked, to mark it and another as a transfer.
 */
export function TransactionRow({ transaction, account, category, categories, onEdit, pick, row }: RowProps) {
  const { t } = useTranslation()
  const locale = useLocale()
  const removeTransaction = useDeleteTransaction()
  const removeTransfer = useDeleteTransfer()
  // A leg is deleted as its transfer, which takes the other leg with it.
  const leg = isTransferLeg(transaction) ? transaction : undefined
  const remove = leg ? removeTransfer : removeTransaction
  const [confirming, setConfirming] = useState(false)
  // One the API has not answered yet has no id: there is nothing to edit or delete.
  const saved = isPending(transaction) ? undefined : transaction
  const id = leg?.transferId ?? saved?.id
  const pending = saved === undefined
  const split = isSplit(transaction)
  // A transaction is known by who was paid; without a payee, by what it was for. A split is for several things.
  const title = transaction.payee ?? (split ? t('transactions.split.transaction') : category?.name) ?? t(`transactions.types.${transaction.type}`)
  // What deleting it says: a leg speaks of its transfer.
  const deleting = leg
    ? { explained: t('transfers.deleteExplained'), failed: t('transfers.errors.notDeleted') }
    : { explained: t('transactions.deleteExplained', { name: title }), failed: t('transactions.errors.notDeleted') }

  return (
    <li {...row} className="space-y-2 border-b p-3 last:border-b-0" aria-busy={pending || undefined}>
      <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', pending && 'opacity-60')}>
        {pick && (
          <input type="checkbox" className="size-4" aria-label={t('transfers.pick', { name: title })} checked={pick.picked} onChange={pick.onToggle} />
        )}
        {category && !split && <CategoryBadge icon={category.icon} color={category.color} />}
        {leg && (
          <span aria-hidden data-testid="transfer-mark" className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
            <ArrowRightLeft className="size-4" />
          </span>
        )}
        <div className="min-w-24 flex-1">
          <h2 className="font-medium break-words">{title}</h2>
          {transaction.isRefund && (
            <span className="inline-block rounded-full border border-success/40 bg-success/10 px-2 text-xs font-medium text-success">
              {t('transactions.refund')}
            </span>
          )}
          <p data-testid="details" className="text-sm text-muted-foreground">
            {joinDetails([leg ? t('transfers.mark') : split ? t('transactions.split.label') : category?.name, account?.name, formatDate(transaction.date, locale)])}
          </p>
          {split && (
            <ul aria-label={t('transactions.split.linesOf', { name: title })} className="text-sm text-muted-foreground">
              {transaction.lines.map((line, index) => (
                // Lines have no id of their own; their order is theirs.
                <li key={index} className="break-words">
                  {findCategory(categories, line.categoryId)?.name}
                  {detailSeparator}
                  <Money amount={line.amount} currency={transaction.currency} />
                  {line.note && detailSeparator + line.note}
                </li>
              ))}
            </ul>
          )}
          {transaction.isReconciled && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Lock aria-hidden className="size-3" />
              {t('transactions.reconciled')}
            </span>
          )}
          {transaction.note && <p className="text-sm break-words text-muted-foreground">{transaction.note}</p>}
          {transaction.recurringRuleId && <RecurringRuleLink ruleId={transaction.recurringRuleId} />}
        </div>
        <span data-testid="amount" className="font-medium tabular-nums">
          {/* The type gives the sign, except that a refund is an expense coming back. Putting it in front of the digits is not arithmetic. */}
          {transaction.isRefund && '+'}
          <Money amount={signedAmount(transaction.amount, takesFromBalance(transaction))} currency={transaction.currency} />
        </span>
        {saved && !confirming && (
          <>
            <Button variant="outline" size="sm" aria-label={t('transactions.editNamed', { name: title })} onClick={() => onEdit(saved)}>
              {t('transactions.edit')}
            </Button>
            {/* A reconciled transaction cannot be deleted until its reconciliation is reopened. */}
            {!transaction.isReconciled && (
              <Button variant="ghost" size="sm" aria-label={t('transactions.deleteNamed', { name: title })} onClick={() => setConfirming(true)}>
                {t('transactions.delete')}
              </Button>
            )}
          </>
        )}
      </div>
      {id !== undefined && confirming && (
        <div role="group" aria-label={t('transactions.deleteNamed', { name: title })} className="space-y-2 rounded-md bg-muted p-3">
          <p className="text-sm">{deleting.explained}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="destructive" size="sm" disabled={remove.isPending} onClick={() => remove.mutate(id)}>
              {t('transactions.deleteConfirm')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
              {t('transactions.cancel')}
            </Button>
          </div>
        </div>
      )}
      <FailureToast
        failed={remove.isError}
        message={deleting.failed}
        retry={() => id !== undefined && remove.mutate(id)}
        onDismiss={remove.reset}
      />
    </li>
  )
}
