import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { findAccount, type Account } from '@/features/accounts'
import { useCategoryChoices, type Category, type CategoryKind } from '@/features/categories'
import { useIdempotencyKey } from '@/shared/api/useIdempotencyKey'
import { isStale } from '@/shared/api/versionedSave'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { FailureToast } from '@/shared/components/FailureToast'
import { SelectField } from '@/shared/components/SelectField'
import { Button } from '@/shared/ui/button'
import { transferQuery, useCreateTransfer, useEditTransfer, useUnmarkTransfer, type Transfer, type TransferFields, type UnmarkField } from '../api/transfers'
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

/** The user's category tree, archived categories included, for the categories a transfer's legs take once unmarked. */
type CategoriesProps = { categories: Category[] }

/** Loads the transfer a leg belongs to, both legs as one, and opens it in the transfer form, where it can be unmarked too. */
export function OpenTransfer({ id, accounts, categories, onClose }: TransferProps & CategoriesProps & { id: string }) {
  const { t } = useTranslation()
  const transfer = useQuery(transferQuery(id))

  // Deleted somewhere else since the list was loaded: there is nothing left to edit.
  useEffect(() => {
    if (transfer.data === null) onClose()
  }, [transfer.data, onClose])

  if (transfer.isError) return <ErrorMessage>{t('transfers.errors.notLoaded')}</ErrorMessage>
  if (!transfer.data) return <p aria-busy className="text-muted-foreground">{t('transfers.loading')}</p>
  return (
    <>
      <EditTransfer transfer={transfer.data} accounts={accounts} onClose={onClose} />
      {/* Either leg reconciled, its legs stay a transfer until the reconciliation is reopened. */}
      {!transfer.data.isReconciled && <UnmarkTransfer transfer={transfer.data} accounts={accounts} categories={categories} onClose={onClose} />}
    </>
  )
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

/** The fields of unmarking, each the category of one leg; the kind of category it takes. */
const legs = [
  { field: 'expenseCategoryId', kind: 'expense', accountOf: (transfer: Transfer) => transfer.fromAccountId, label: 'transfers.expenseCategory' },
  { field: 'incomeCategoryId', kind: 'income', accountOf: (transfer: Transfer) => transfer.toAccountId, label: 'transfers.incomeCategory' },
] as const satisfies readonly { field: UnmarkField; kind: CategoryKind; accountOf: (transfer: Transfer) => string; label: string }[]

/**
 * Unmarks the transfer (spec IMP-7): its Transfer out leg becomes an expense and its Transfer in leg income, on
 * the categories the user chooses, as a leg has none. Any transfer can be unmarked, marked or recorded. Shown
 * once the user asks for it, under the transfer form.
 */
function UnmarkTransfer({ transfer, accounts, categories, onClose }: TransferProps & CategoriesProps & { transfer: Transfer }) {
  const { t } = useTranslation()
  const unmark = useUnmarkTransfer(transfer.id)
  const choices = useCategoryChoices(categories)
  const [asked, setAsked] = useState(false)
  const [chosen, setChosen] = useState<Record<UnmarkField, string>>({ expenseCategoryId: '', incomeCategoryId: '' })
  // A field is checked once the user has tried to unmark: until then, an empty one is no mistake.
  const [submitted, setSubmitted] = useState(false)
  const refused = unmark.data?.saved === false ? unmark.data.fields : []

  const send = () => unmark.mutate(chosen, { onSuccess: (outcome) => outcome.saved && onClose() })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    if (chosen.expenseCategoryId && chosen.incomeCategoryId) send()
  }

  if (!asked) {
    return (
      <Button variant="outline" className="mt-6" onClick={() => setAsked(true)}>
        {t('transfers.unmark')}
      </Button>
    )
  }

  return (
    <form noValidate onSubmit={submit} aria-label={t('transfers.unmark')} className="mt-6 space-y-4 border-t pt-4">
      <p className="text-sm text-muted-foreground">{t('transfers.unmarkExplained')}</p>
      {legs.map(({ field, kind, accountOf, label }) => {
        const error = refused.includes(field) ? t('transfers.errors.categoryArchived') : submitted && !chosen[field] ? t('transactions.errors.category') : undefined
        return (
          <SelectField
            key={field}
            label={t(label, { account: findAccount(accounts, accountOf(transfer))?.name ?? '' })}
            value={chosen[field]}
            onChange={(event) => setChosen({ ...chosen, [field]: event.target.value })}
            error={error}
            options={[
              { value: '', label: t('transfers.chooseCategory') },
              ...choices.filter(({ category }) => category.kind === kind && !category.isArchived).map(({ category, label }) => ({ value: category.id, label })),
            ]}
          />
        )
      })}
      <Button type="submit" variant="destructive" disabled={unmark.isPending}>
        {t('transfers.unmarkConfirm')}
      </Button>
      <FailureToast failed={unmark.isError} message={t('transfers.errors.notUnmarked')} retry={send} onDismiss={unmark.reset} />
    </form>
  )
}
