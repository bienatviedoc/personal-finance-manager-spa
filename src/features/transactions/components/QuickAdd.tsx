import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { accountsQuery, type Account } from '@/features/accounts'
import { categoriesQuery, type Category } from '@/features/categories'
import { useIdempotencyKey } from '@/shared/api/useIdempotencyKey'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { Drawer } from '@/shared/components/Drawer'
import { FailureToast } from '@/shared/components/FailureToast'
import { lastAccountQuery, useCreateTransaction, type TransactionDraft } from '../api/transactions'
import { QuickAddContext } from './quickAddContext'
import { TransactionForm } from './TransactionForm'

/**
 * Quick add (spec TXN-8 and section 12): pressing N on any screen inside the shell opens the drawer that
 * records a transaction, as does whatever calls `useQuickAdd()`. The drawer starts on the account used last
 * and stays open, cleared, for the next transaction. Nothing is loaded until it first opens.
 */
export function QuickAdd({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const show = useCallback(() => setOpen(true), [])
  useShortcutToAdd(show)

  return (
    <QuickAddContext value={show}>
      {children}
      <Drawer open={open} onOpenChange={setOpen} title={t('transactions.new')}>
        <NewTransaction onClose={() => setOpen(false)} />
      </Drawer>
    </QuickAddContext>
  )
}

/** Loads what the form offers and starts from, then shows it. */
function NewTransaction({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  // Archived ones too, under the key the transactions screen loads them with; the form leaves them out.
  const accounts = useQuery(accountsQuery({ includeArchived: true }))
  const categories = useQuery(categoriesQuery({ includeArchived: true }))
  const lastAccount = useQuery(lastAccountQuery)

  if (accounts.isError || categories.isError) return <ErrorMessage>{t('transactions.errors.generic')}</ErrorMessage>
  // The account used last is a convenience: when it cannot be loaded, the form starts on the first account.
  if (!accounts.data || !categories.data || lastAccount.isPending) return <p role="status">{t('transactions.loadingForm')}</p>
  if (!accounts.data.accounts.some((account) => !account.isArchived)) {
    return (
      <p className="text-muted-foreground">
        {t('transactions.noAccounts')}{' '}
        <Link className="underline" to="/accounts" onClick={onClose}>
          {t('transactions.toAccounts')}
        </Link>
      </p>
    )
  }

  return <AddTransaction accounts={accounts.data.accounts} categories={categories.data} lastAccountId={lastAccount.data ?? undefined} onClose={onClose} />
}

type AddProps = { accounts: Account[]; categories: Category[]; lastAccountId?: string; onClose: () => void }

/** Records one transaction after another: the drawer stays open, ready for the next transaction (spec section 12). */
function AddTransaction({ accounts, categories, lastAccountId, onClose }: AddProps) {
  const { t } = useTranslation()
  const formId = useId()
  const create = useCreateTransaction()
  // The next transaction is a new request too.
  const idempotencyKey = useIdempotencyKey()

  return (
    <>
      <TransactionForm
        id={formId}
        accounts={accounts}
        categories={categories}
        lastAccountId={lastAccountId}
        onSave={(draft: TransactionDraft) => create.mutateAsync({ ...draft, idempotencyKey: idempotencyKey.keyFor(draft.fields) })}
        onSaved={idempotencyKey.next}
        onCancel={onClose}
      />
      <FailureToast failed={create.isError} message={t('transactions.errors.notSaved')} retry={{ form: formId }} onDismiss={create.reset} />
    </>
  )
}

/**
 * Pressing N anywhere opens the drawer (spec section 12), unless the user is typing somewhere, holding a
 * modifier, or already in a drawer or dialog, this one included.
 */
function useShortcutToAdd(open: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && (event.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName))
      if (event.key.toLowerCase() !== 'n' || event.ctrlKey || event.metaKey || event.altKey || typing) return
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return
      event.preventDefault()
      open()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])
}
