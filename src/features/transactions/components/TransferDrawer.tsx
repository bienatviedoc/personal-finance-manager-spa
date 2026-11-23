import { useQuery } from '@tanstack/react-query'
import { useEffect, useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { Account } from '@/features/accounts'
import { useIdempotencyKey } from '@/shared/api/useIdempotencyKey'
import { isStale } from '@/shared/api/versionedSave'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { FailureToast } from '@/shared/components/FailureToast'
import { transferQuery, useCreateTransfer, useEditTransfer, type Transfer, type TransferFields } from '../api/transfers'
import { TransferForm } from './TransferForm'

type TransferProps = { accounts: Account[]; onClose: () => void }

/** Records one transfer and closes: the two legs join the list once the API has answered. */
export function AddTransfer({ accounts, onClose }: TransferProps) {
  const { t } = useTranslation()
  const formId = useId()
  const create = useCreateTransfer()
  const idempotencyKey = useIdempotencyKey()

  return (
    <>
      <TransferForm
        id={formId}
        accounts={accounts}
        onSave={(fields: TransferFields) => create.mutateAsync({ fields, idempotencyKey: idempotencyKey.keyFor(fields) })}
        onSaved={onClose}
        onCancel={onClose}
      />
      <FailureToast failed={create.isError} message={t('transfers.errors.notSaved')} retry={{ form: formId }} onDismiss={create.reset} />
    </>
  )
}

/** Loads the transfer a leg belongs to, both legs as one, and opens it in the transfer form. */
export function OpenTransfer({ id, accounts, onClose }: TransferProps & { id: string }) {
  const { t } = useTranslation()
  const transfer = useQuery(transferQuery(id))

  // Deleted somewhere else since the list was loaded: there is nothing left to edit.
  useEffect(() => {
    if (transfer.data === null) onClose()
  }, [transfer.data, onClose])

  if (transfer.isError) return <ErrorMessage>{t('transfers.errors.notLoaded')}</ErrorMessage>
  if (!transfer.data) return <p aria-busy className="text-muted-foreground">{t('transfers.loading')}</p>
  return <EditTransfer transfer={transfer.data} accounts={accounts} onClose={onClose} />
}

function EditTransfer({ transfer, accounts, onClose }: TransferProps & { transfer: Transfer }) {
  const { t } = useTranslation()
  const formId = useId()
  const edit = useEditTransfer(transfer)
  const stale = isStale(edit.data)

  return (
    <>
      {stale && <ErrorMessage>{t('transfers.errors.stale')}</ErrorMessage>}
      {/* A new row version is a new transfer to edit: the form starts again from what the API holds now. */}
      <TransferForm key={transfer.rowVersion} id={formId} transfer={transfer} accounts={accounts} onSave={edit.mutateAsync} onSaved={onClose} onCancel={onClose} />
      <FailureToast failed={edit.isError} message={t('transfers.errors.notSaved')} retry={{ form: formId }} onDismiss={edit.reset} />
    </>
  )
}
