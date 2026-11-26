import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Account } from '@/features/accounts'
import { findCategory, type Category } from '@/features/categories'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { FailureToast } from '@/shared/components/FailureToast'
import { SelectField } from '@/shared/components/SelectField'
import { TextField } from '@/shared/components/TextField'
import { formatDate } from '@/shared/dates'
import { useLocale } from '@/shared/i18n/useLocale'
import { formatMoney, signedAmount } from '@/shared/money'
import { Button } from '@/shared/ui/button'
import { useBulkEdit, type BulkAction, type BulkSelection, type RefusedTransaction } from '../api/bulk'
import { takesFromBalance } from '../api/transactions'
import { transactionTitle } from './transactionTitle'

type Props = {
  /** How many transactions are selected. */
  count: number
  /** Which they are, as the API is sent them. */
  selection: BulkSelection
  /** Every account, archived too: the ones not archived are offered to move to. */
  accounts: Account[]
  /** The category tree, archived too: the ones not archived are offered. */
  categories: Category[]
  /** What a transaction the API refused and no longer has is called in the list, by its id. */
  nameOf: (id: string) => string
  /** Called once the action is done, to clear the selection. */
  onDone: () => void
  onClear: () => void
}

/**
 * One action on the transactions selected in the list (spec TXN-7): set their category, add or remove a tag,
 * move them to another account, or delete them. All of them take it or none does; the API decides, and when it
 * refuses, each transaction it refused is named with why, and the selection stays for the user to change.
 */
export function BulkActions({ count, selection, accounts, categories, nameOf, onDone, onClear }: Props) {
  const { t } = useTranslation()
  const locale = useLocale()
  const bulk = useBulkEdit()
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [tag, setTag] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // What was sent last, to send again from the failure toast, which forgets the failure first.
  const [last, setLast] = useState<BulkAction>()
  const send = (action: BulkAction) => {
    setLast(action)
    bulk.mutate({ ...action, ...selection }, { onSuccess: (outcome) => outcome.done && onDone() })
  }
  const retry = () => last && send(last)
  const outcome = bulk.data
  const categoryOptions = categories
    .filter((category) => !category.isArchived)
    .flatMap((category) => [category, ...category.subcategories.filter((sub) => !sub.isArchived)])
    .map((category) => ({ value: category.id, label: category.name }))
  const accountOptions = accounts.filter((account) => !account.isArchived).map((account) => ({ value: account.id, label: account.name }))
  // Named as the API answers it, loaded on the screen or not: by its title, date and amount, signed as the list signs it.
  const describe = ({ transactionId, transaction }: RefusedTransaction) =>
    transaction
      ? t('transactions.bulk.refusedTransaction', {
          title: transactionTitle(transaction, findCategory(categories, transaction.categoryId), t),
          date: formatDate(transaction.date, locale),
          amount: formatMoney(signedAmount(transaction.amount, takesFromBalance(transaction)), transaction.currency, locale, true),
        })
      : nameOf(transactionId)
  const hasTag = tag.trim() !== ''
  const setCategory = () => send({ action: 'setCategory', categoryId })
  const addTag = () => send({ action: 'addTag', tag })
  const removeTag = () => send({ action: 'removeTag', tag })
  const moveToAccount = () => send({ action: 'moveToAccount', accountId })
  const deleteThem = () => {
    setConfirmingDelete(false)
    send({ action: 'delete' })
  }

  return (
    <section aria-label={t('transactions.bulk.title')} className="space-y-3 rounded-lg border bg-muted/40 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">{t('transactions.bulk.selected', { count })}</p>
        <Button size="sm" variant="outline" onClick={onClear}>
          {t('transactions.bulk.clear')}
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <SelectField
            label={t('transactions.category')}
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            options={[{ value: '', label: t('transactions.chooseCategory') }, ...categoryOptions]}
          />
        </div>
        <Button size="sm" disabled={categoryId === '' || bulk.isPending} onClick={setCategory}>
          {t('transactions.bulk.setCategory')}
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <TextField label={t('transactions.bulk.tag')} value={tag} maxLength={50} onChange={(event) => setTag(event.target.value)} />
        </div>
        <Button size="sm" disabled={!hasTag || bulk.isPending} onClick={addTag}>
          {t('transactions.bulk.addTag')}
        </Button>
        <Button size="sm" variant="outline" disabled={!hasTag || bulk.isPending} onClick={removeTag}>
          {t('transactions.bulk.removeTag')}
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <SelectField
            label={t('transactions.account')}
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            options={[{ value: '', label: t('transactions.bulk.chooseAccount') }, ...accountOptions]}
          />
        </div>
        <Button size="sm" disabled={accountId === '' || bulk.isPending} onClick={moveToAccount}>
          {t('transactions.bulk.move')}
        </Button>
      </div>
      {confirmingDelete ? (
        <div role="group" aria-label={t('transactions.bulk.delete')} className="space-y-2 rounded-md bg-muted p-3">
          <p>{t('transactions.bulk.deleteExplained', { count })}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={bulk.isPending}
              onClick={deleteThem}
            >
              {t('transactions.bulk.deleteConfirm')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(false)}>
              {t('transactions.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" size="sm" disabled={bulk.isPending} onClick={() => setConfirmingDelete(true)}>
          {t('transactions.bulk.delete')}
        </Button>
      )}
      {outcome && !outcome.done && 'refused' in outcome && (
        <div role="alert" className="space-y-1 text-destructive">
          <p>{t('transactions.bulk.refused')}</p>
          <ul aria-label={t('transactions.bulk.notChanged')} className="list-disc pl-5">
            {outcome.refused.map((row) => (
              <li key={row.transactionId}>
                {t('transactions.bulk.refusedRow', { name: describe(row), reason: t(`transactions.bulk.refusals.${row.reason}`) })}
              </li>
            ))}
          </ul>
        </div>
      )}
      {outcome && !outcome.done && 'invalid' in outcome && <ErrorMessage>{t('transactions.bulk.invalid')}</ErrorMessage>}
      {outcome && !outcome.done && 'tooMany' in outcome && (
        <ErrorMessage>{t('transactions.bulk.tooMany', { max: outcome.tooMany.toLocaleString(locale) })}</ErrorMessage>
      )}
      <FailureToast failed={bulk.isError} message={t('transactions.bulk.failed')} retry={retry} onDismiss={bulk.reset} />
    </section>
  )
}
