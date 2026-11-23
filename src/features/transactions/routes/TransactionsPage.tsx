import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { accountsQuery, type Account } from '@/features/accounts'
import { CategoryBadge, categoriesQuery, type Category } from '@/features/categories'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { FailureToast } from '@/shared/components/FailureToast'
import { formatDate } from '@/shared/dates'
import { isStale } from '@/shared/api/versionedSave'
import { useLocale } from '@/shared/i18n/useLocale'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { cn, focusRing } from '@/shared/lib/utils'
import { Money } from '@/shared/money'
import { Button } from '@/shared/ui/button'
import { Sheet, SheetClose, SheetContent, SheetTitle } from '@/shared/ui/sheet'
import { ArrowRightLeft, X } from 'lucide-react'
import {
  isPending,
  isTransferLeg,
  listKey,
  takesFromBalance,
  transactionsQuery,
  useCreateTransaction,
  useDeleteTransaction,
  useEditTransaction,
  type ListedTransaction,
  type Transaction,
  type TransactionDraft,
} from '../api/transactions'
import { transferQuery, useCreateTransfer, useDeleteTransfer, useEditTransfer, type Transfer, type TransferFields } from '../api/transfers'
import { TransactionForm } from '../components/TransactionForm'
import { TransferForm } from '../components/TransferForm'

/**
 * What the drawer is open for: recording a transaction, editing this one, as it was when the drawer opened,
 * recording a transfer, or editing the transfer with this id, which either of its legs opens.
 */
type Drawer = { adding: true } | { editing: Transaction } | { transferring: true } | { transferId: string } | null

/**
 * The user's income, expenses and transfers, newest first. Recording and editing happen in a side drawer
 * (spec section 12); the list shows a change to income or an expense as soon as it is sent. A transfer is
 * listed as its two legs, each on its own account and marked as a transfer; either opens the transfer form.
 */
export function TransactionsPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('screens.transactions'))
  const [drawer, setDrawer] = useState<Drawer>(null)
  const transactions = useInfiniteQuery(transactionsQuery)
  // Archived accounts and categories are loaded too: the transactions on them still show their names.
  const accounts = useQuery(accountsQuery({ includeArchived: true }))
  const categories = useQuery(categoriesQuery({ includeArchived: true }))

  const items = transactions.data?.pages.flatMap((page) => page.items)
  // The transaction being edited is read from the list, to follow a newer version loaded while the drawer is
  // open. An edit shown ahead of the API's answer can move it past the pages loaded so far (an earlier date):
  // the drawer then keeps the one it was opened for, so the form and what its save answers are not lost.
  const editing =
    drawer && 'editing' in drawer
      ? (items?.find((transaction): transaction is Transaction => !isPending(transaction) && transaction.id === drawer.editing.id) ?? drawer.editing)
      : undefined
  const open = accounts.data?.accounts.filter((account) => !account.isArchived) ?? []
  const canRecord = open.length > 0
  // A transfer is between two different accounts.
  const canTransfer = open.length > 1
  const drawerTitle =
    drawer && 'transferId' in drawer
      ? t('transfers.editTitle')
      : drawer && 'transferring' in drawer
        ? t('transfers.new')
        : editing
          ? t('transactions.editTitle')
          : t('transactions.new')
  const loaded = items !== undefined && accounts.data !== undefined && categories.data !== undefined

  useShortcutToAdd(() => setDrawer((open) => open ?? { adding: true }), canRecord)

  return (
    <section className="max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{t('screens.transactions')}</h1>
        <p className="text-muted-foreground">{t('transactions.intro')}</p>
      </div>

      {accounts.data && !canRecord ? (
        <p className="text-muted-foreground">
          {t('transactions.noAccounts')}{' '}
          <Link className="underline" to="/accounts">
            {t('transactions.toAccounts')}
          </Link>
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button disabled={!loaded} aria-keyshortcuts="N" onClick={() => setDrawer({ adding: true })}>
            {t('transactions.add')}
          </Button>
          {canTransfer && (
            <Button variant="outline" disabled={!loaded} onClick={() => setDrawer({ transferring: true })}>
              <ArrowRightLeft aria-hidden />
              {t('transfers.add')}
            </Button>
          )}
        </div>
      )}

      {(transactions.isError || accounts.isError || categories.isError) && <ErrorMessage>{t('transactions.errors.generic')}</ErrorMessage>}
      {!loaded && !transactions.isError && <ListSkeleton />}
      {loaded && items.length === 0 && canRecord && <p className="text-muted-foreground">{t('transactions.empty')}</p>}
      {loaded && items.length > 0 && (
        <ul aria-label={t('screens.transactions')} className="divide-y rounded-lg border">
          {items.map((transaction) => (
            <TransactionRow
              key={listKey(transaction)}
              transaction={transaction}
              account={accounts.data.accounts.find((account) => account.id === transaction.accountId)}
              category={findCategory(categories.data, transaction.categoryId)}
              onEdit={(editing) => setDrawer(isTransferLeg(editing) ? { transferId: editing.transferId } : { editing })}
            />
          ))}
        </ul>
      )}
      {transactions.hasNextPage && (
        <Button variant="outline" disabled={transactions.isFetchingNextPage} onClick={() => void transactions.fetchNextPage()}>
          {t('transactions.loadMore')}
        </Button>
      )}

      <Sheet open={drawer !== null} onOpenChange={(open) => !open && setDrawer(null)}>
        <SheetContent
          // The sheet's own close button has no translated name; ours does.
          showCloseButton={false}
          aria-describedby={undefined}
          className="w-full gap-4 overflow-y-auto bg-background p-4 text-foreground sm:max-w-md"
        >
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg font-semibold">{drawerTitle}</SheetTitle>
            <SheetClose className={cn('rounded-md p-2 hover:bg-muted', focusRing)} aria-label={t('nav.close')}>
              <X aria-hidden className="size-5" />
            </SheetClose>
          </div>
          {loaded && drawer && 'adding' in drawer && (
            <AddTransaction accounts={accounts.data.accounts} categories={categories.data} onClose={() => setDrawer(null)} />
          )}
          {loaded && editing && (
            <EditTransaction transaction={editing} accounts={accounts.data.accounts} categories={categories.data} onClose={() => setDrawer(null)} />
          )}
          {loaded && drawer && 'transferring' in drawer && <AddTransfer accounts={accounts.data.accounts} onClose={() => setDrawer(null)} />}
          {loaded && drawer && 'transferId' in drawer && (
            <OpenTransfer id={drawer.transferId} accounts={accounts.data.accounts} onClose={() => setDrawer(null)} />
          )}
        </SheetContent>
      </Sheet>
    </section>
  )
}

type FormProps = { accounts: Account[]; categories: Category[]; onClose: () => void }

/** Records one transaction after another: the drawer stays open, ready for the next transaction (spec section 12). */
function AddTransaction({ accounts, categories, onClose }: FormProps) {
  const { t } = useTranslation()
  const formId = useId()
  const create = useCreateTransaction()
  // One key per request the user means to make: saving the same values again after a failure sends the same
  // one, so the API cannot record the transaction twice. Changed values are a new request, and so is the
  // next transaction: each takes a new key.
  const attempt = useRef<{ key: string; sent?: string }>({ key: crypto.randomUUID() })

  return (
    <>
      <TransactionForm
        id={formId}
        accounts={accounts}
        categories={categories}
        onSave={(draft: TransactionDraft) => {
          const sending = JSON.stringify(draft.fields)
          if (attempt.current.sent !== undefined && attempt.current.sent !== sending) attempt.current.key = crypto.randomUUID()
          attempt.current.sent = sending
          return create.mutateAsync({ ...draft, idempotencyKey: attempt.current.key })
        }}
        onSaved={() => {
          attempt.current = { key: crypto.randomUUID() }
        }}
        onCancel={onClose}
      />
      <FailureToast failed={create.isError} message={t('transactions.errors.notSaved')} retry={{ form: formId }} onDismiss={create.reset} />
    </>
  )
}

function EditTransaction({ transaction, accounts, categories, onClose }: FormProps & { transaction: Transaction }) {
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
      <FailureToast failed={edit.isError} message={t('transactions.errors.notSaved')} retry={{ form: formId }} onDismiss={edit.reset} />
    </>
  )
}

type TransferProps = { accounts: Account[]; onClose: () => void }

/** Records one transfer and closes: the two legs join the list once the API has answered. */
function AddTransfer({ accounts, onClose }: TransferProps) {
  const { t } = useTranslation()
  const formId = useId()
  const create = useCreateTransfer()
  // One key per request the user means to make, as for a transaction: the same values sent again after a
  // failure carry the same key, and changed values a new one.
  const attempt = useRef<{ key: string; sent?: string }>({ key: crypto.randomUUID() })

  return (
    <>
      <TransferForm
        id={formId}
        accounts={accounts}
        onSave={(fields: TransferFields) => {
          const sending = JSON.stringify(fields)
          if (attempt.current.sent !== undefined && attempt.current.sent !== sending) attempt.current.key = crypto.randomUUID()
          attempt.current.sent = sending
          return create.mutateAsync({ fields, idempotencyKey: attempt.current.key })
        }}
        onSaved={onClose}
        onCancel={onClose}
      />
      <FailureToast failed={create.isError} message={t('transfers.errors.notSaved')} retry={{ form: formId }} onDismiss={create.reset} />
    </>
  )
}

/** Loads the transfer a leg belongs to, both legs as one, and opens it in the transfer form. */
function OpenTransfer({ id, accounts, onClose }: TransferProps & { id: string }) {
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

type RowProps = { transaction: ListedTransaction; account?: Account; category?: Category; onEdit: (transaction: Transaction) => void }

function TransactionRow({ transaction, account, category, onEdit }: RowProps) {
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
  // A transaction is known by who was paid; without a payee, by what it was for.
  const title = transaction.payee ?? category?.name ?? t(`transactions.types.${transaction.type}`)

  return (
    <li className="space-y-2 p-3" aria-busy={pending || undefined}>
      <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', pending && 'opacity-60')}>
        {category && <CategoryBadge icon={category.icon} color={category.color} />}
        {leg && (
          <span aria-hidden data-testid="transfer-mark" className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
            <ArrowRightLeft className="size-4" />
          </span>
        )}
        <div className="min-w-24 flex-1">
          <h2 className="font-medium break-words">{title}</h2>
          <p data-testid="details" className="text-sm text-muted-foreground">
            {[leg ? t('transfers.mark') : category?.name, account?.name, formatDate(transaction.date, locale)].filter(Boolean).join(' · ')}
          </p>
          {transaction.note && <p className="text-sm break-words text-muted-foreground">{transaction.note}</p>}
        </div>
        <span data-testid="amount" className="font-medium tabular-nums">
          {/* The type gives the sign. Putting it in front of the digits is not arithmetic. */}
          <Money amount={takesFromBalance(transaction) ? `-${transaction.amount}` : transaction.amount} currency={transaction.currency} />
        </span>
        {saved && !confirming && (
          <>
            <Button variant="outline" size="sm" aria-label={t('transactions.editNamed', { name: title })} onClick={() => onEdit(saved)}>
              {t('transactions.edit')}
            </Button>
            <Button variant="ghost" size="sm" aria-label={t('transactions.deleteNamed', { name: title })} onClick={() => setConfirming(true)}>
              {t('transactions.delete')}
            </Button>
          </>
        )}
      </div>
      {id !== undefined && confirming && (
        <div role="group" aria-label={t('transactions.deleteNamed', { name: title })} className="space-y-2 rounded-md bg-muted p-3">
          <p className="text-sm">{leg ? t('transfers.deleteExplained') : t('transactions.deleteExplained', { name: title })}</p>
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
        message={leg ? t('transfers.errors.notDeleted') : t('transactions.errors.notDeleted')}
        retry={() => id !== undefined && remove.mutate(id)}
        onDismiss={remove.reset}
      />
    </li>
  )
}

function findCategory(tree: Category[], id: string | null): Category | undefined {
  return tree.flatMap((category) => [category, ...category.subcategories]).find((category) => category.id === id)
}

/**
 * Pressing N anywhere on the screen opens the drawer to record a transaction (spec section 12), unless the
 * user is typing somewhere or holding a modifier.
 */
function useShortcutToAdd(open: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && (event.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName))
      if (event.key.toLowerCase() !== 'n' || event.ctrlKey || event.metaKey || event.altKey || typing) return
      event.preventDefault()
      open()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, enabled])
}

/** Rows standing in for the list while it loads. */
function ListSkeleton() {
  const { t } = useTranslation()
  return (
    <ul aria-busy aria-label={t('transactions.loading')} className="divide-y rounded-lg border">
      {[0, 1, 2].map((row) => (
        <li key={row} className="flex items-center gap-3 p-3">
          <span className="size-7 animate-pulse rounded-full bg-muted" />
          <span className="h-4 flex-1 animate-pulse rounded bg-muted" />
          <span className="h-4 w-20 animate-pulse rounded bg-muted" />
        </li>
      ))}
    </ul>
  )
}
