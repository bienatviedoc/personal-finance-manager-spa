import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { Account } from '@/features/accounts'
import type { Category } from '@/features/categories'
import { isStale } from '@/shared/api/versionedSave'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { FailureToast } from '@/shared/components/FailureToast'
import { useEditTransaction, type Transaction } from '../api/transactions'
import { Attachments } from './Attachments'
import { TransactionForm } from './TransactionForm'

type FormProps = { accounts: Account[]; categories: Category[]; onClose: () => void }

/** Edits income or an expense, with its attachments, in the transactions screen's drawer. */
export function EditTransaction({ transaction, accounts, categories, onClose }: FormProps & { transaction: Transaction }) {
  const { t } = useTranslation()
  const formId = useId()
  const edit = useEditTransaction(transaction)
  const stale = isStale(edit.data)

  return (
    <>
      {stale && <ErrorMessage>{t('transactions.errors.stale')}</ErrorMessage>}
      {/* A new row version is a new transaction to edit: the form starts again from what the API holds now. */}
      <TransactionForm
        key={transaction.rowVersion}
        id={formId}
        transaction={transaction}
        accounts={accounts}
        categories={categories}
        onSave={edit.mutateAsync}
        onSaved={onClose}
        onCancel={onClose}
      />
      <Attachments transactionId={transaction.id} />
      <FailureToast failed={edit.isError} message={t('transactions.errors.notSaved')} retry={{ form: formId }} onDismiss={edit.reset} />
    </>
  )
}
