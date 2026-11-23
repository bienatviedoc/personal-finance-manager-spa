import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { accountsQuery, type Account } from '@/features/accounts'
import { CategoryBadge, categoriesQuery, type Category } from '@/features/categories'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { escapeClosesPickerFirst } from '@/shared/components/escapeClosesPickerFirst'
import { FailureToast } from '@/shared/components/FailureToast'
import { formatDate } from '@/shared/dates'
import { isStale } from '@/shared/api/versionedSave'
import { useLocale } from '@/shared/i18n/useLocale'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { cn, focusRing } from '@/shared/lib/utils'
import { Money } from '@/shared/money'
import { Button } from '@/shared/ui/button'
import { Sheet, SheetClose, SheetContent, SheetTitle } from '@/shared/ui/sheet'
import { X } from 'lucide-react'
import {
  isPending,
  listKey,
  transactionsQuery,
  useDeleteTransaction,
  useEditTransaction,
  type ListedTransaction,
  type Transaction,
} from '../api/transactions'
import { useQuickAdd } from '../components/quickAddContext'
import { TransactionForm } from '../components/TransactionForm'

/** What the drawer is open for: editing this transaction, as it was when the drawer opened. */
type Drawer = { editing: Transaction } | null

/**
 * The user's income and expenses, newest first. Recording and editing happen in a side drawer (spec section
 * 12): editing in this screen's own, recording in the one quick add opens on every screen. The list shows a
 * change as soon as it is sent.
 */
export function TransactionsPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('screens.transactions'))
  const [drawer, setDrawer] = useState<Drawer>(null)
  const addTransaction = useQuickAdd()
  const transactions = useInfiniteQuery(transactionsQuery)
  // Archived accounts and categories are loaded too: the transactions on them still show their names.
  const accounts = useQuery(accountsQuery({ includeArchived: true }))
  const categories = useQuery(categoriesQuery({ includeArchived: true }))

  const items = transactions.data?.pages.flatMap((page) => page.items)
  // The transaction being edited is read from the list, to follow a newer version loaded while the drawer is
  // open. An edit shown ahead of the API's answer can move it past the pages loaded so far (an earlier date):
  // the drawer then keeps the one it was opened for, so the form and what its save answers are not lost.
  const editing =
    drawer
      ? (items?.find((transaction): transaction is Transaction => !isPending(transaction) && transaction.id === drawer.editing.id) ?? drawer.editing)
      : undefined
  const canRecord = accounts.data?.accounts.some((account) => !account.isArchived) ?? false
  const loaded = items !== undefined && accounts.data !== undefined && categories.data !== undefined

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
        <Button disabled={!loaded} aria-keyshortcuts="N" onClick={addTransaction}>
          {t('transactions.add')}
        </Button>
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
              onEdit={(editing) => setDrawer({ editing })}
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
          onEscapeKeyDown={escapeClosesPickerFirst}
          className="w-full gap-4 overflow-y-auto bg-background p-4 text-foreground sm:max-w-md"
        >
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg font-semibold">{t('transactions.editTitle')}</SheetTitle>
            <SheetClose className={cn('rounded-md p-2 hover:bg-muted', focusRing)} aria-label={t('nav.close')}>
              <X aria-hidden className="size-5" />
            </SheetClose>
          </div>
          {loaded && editing && (
            <EditTransaction transaction={editing} accounts={accounts.data.accounts} categories={categories.data} onClose={() => setDrawer(null)} />
          )}
        </SheetContent>
      </Sheet>
    </section>
  )
}

type FormProps = { accounts: Account[]; categories: Category[]; onClose: () => void }

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

type RowProps = { transaction: ListedTransaction; account?: Account; category?: Category; onEdit: (transaction: Transaction) => void }

function TransactionRow({ transaction, account, category, onEdit }: RowProps) {
  const { t } = useTranslation()
  const locale = useLocale()
  const remove = useDeleteTransaction()
  const [confirming, setConfirming] = useState(false)
  // One the API has not answered yet has no id: there is nothing to edit or delete.
  const saved = isPending(transaction) ? undefined : transaction
  const id = saved?.id
  const pending = saved === undefined
  // A transaction is known by who was paid; without a payee, by what it was for.
  const title = transaction.payee ?? category?.name ?? t(`transactions.types.${transaction.type}`)

  return (
    <li className="space-y-2 p-3" aria-busy={pending || undefined}>
      <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', pending && 'opacity-60')}>
        {category && <CategoryBadge icon={category.icon} color={category.color} />}
        <div className="min-w-24 flex-1">
          <h2 className="font-medium break-words">{title}</h2>
          <p data-testid="details" className="text-sm text-muted-foreground">
            {[category?.name, account?.name, formatDate(transaction.date, locale)].filter(Boolean).join(' · ')}
          </p>
          {transaction.note && <p className="text-sm break-words text-muted-foreground">{transaction.note}</p>}
        </div>
        <span data-testid="amount" className="font-medium tabular-nums">
          {/* The type gives the sign. Putting it in front of the digits is not arithmetic. */}
          <Money amount={transaction.type === 'expense' ? `-${transaction.amount}` : transaction.amount} currency={transaction.currency} />
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
          <p className="text-sm">{t('transactions.deleteExplained', { name: title })}</p>
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
        message={t('transactions.errors.notDeleted')}
        retry={() => id !== undefined && remove.mutate(id)}
        onDismiss={remove.reset}
      />
    </li>
  )
}

function findCategory(tree: Category[], id: string): Category | undefined {
  return tree.flatMap((category) => [category, ...category.subcategories]).find((category) => category.id === id)
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
