import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { accountsQuery, type Account } from '@/features/accounts'
import { CategoryBadge, categoriesQuery, type Category } from '@/features/categories'
import { useUserSettings } from '@/features/settings'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { FailureToast } from '@/shared/components/FailureToast'
import { formatDate } from '@/shared/dates'
import { isStale } from '@/shared/api/versionedSave'
import { useLocale } from '@/shared/i18n/useLocale'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { cn, focusRing } from '@/shared/lib/utils'
import { Money, type Currency } from '@/shared/money'
import { Button } from '@/shared/ui/button'
import { Sheet, SheetClose, SheetContent, SheetTitle } from '@/shared/ui/sheet'
import { X } from 'lucide-react'
import {
  isPending,
  listKey,
  transactionsQuery,
  useCreateTransaction,
  useDeleteTransaction,
  useEditTransaction,
  type ListedTransaction,
  type Transaction,
  type TransactionDraft,
} from '../api/transactions'
import { TransactionFilterBar } from '../components/TransactionFilterBar'
import { TransactionForm } from '../components/TransactionForm'
import { TransactionTotal } from '../components/TransactionTotal'
import { VirtualRows, type VirtualRow } from '../components/VirtualRows'
import { useTransactionFilters } from '../hooks/useTransactionFilters'

/** What the drawer is open for: recording a transaction, or editing this one, as it was when the drawer opened. */
type Drawer = { adding: true } | { editing: Transaction } | null

/**
 * The user's income and expenses, narrowed and sorted by the filters in the address, with what they come to.
 * Only the rows near the screen are in the page, and the next page is loaded as the last row comes near.
 * Recording and editing happen in a side drawer (spec section 12); the list shows a change as soon as it is sent.
 */
export function TransactionsPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('screens.transactions'))
  const [drawer, setDrawer] = useState<Drawer>(null)
  const { baseCurrency } = useUserSettings()
  const { view, isFiltered, change, clear } = useTransactionFilters()
  const transactions = useInfiniteQuery(transactionsQuery(view))
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
  const canRecord = accounts.data?.accounts.some((account) => !account.isArchived) ?? false
  const loaded = items !== undefined && accounts.data !== undefined && categories.data !== undefined
  const canOpenDrawer = accounts.data !== undefined && categories.data !== undefined
  // Every page carries the total of everything that passes the filters; the last one loaded is the latest word.
  const total = transactions.data?.pages.at(-1)?.total

  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = transactions
  // A page that failed to load is asked for again by the user, not by the list at every render.
  const loadNextPage = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage])

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
        <Button disabled={!canOpenDrawer} aria-keyshortcuts="N" onClick={() => setDrawer({ adding: true })}>
          {t('transactions.add')}
        </Button>
      )}

      {accounts.data && categories.data && (
        <TransactionFilterBar
          view={view}
          isFiltered={isFiltered}
          onChange={change}
          onClear={clear}
          accounts={accounts.data.accounts}
          categories={categories.data}
          fallbackCurrency={mostDecimals(accounts.data.accounts.map((account) => account.currency)) ?? baseCurrency}
        />
      )}

      {(transactions.isError || accounts.isError || categories.isError) && <ErrorMessage>{t('transactions.errors.generic')}</ErrorMessage>}
      {!loaded && !transactions.isError && <ListSkeleton label={t('transactions.loading')} />}
      {loaded && total && items.length > 0 && <TransactionTotal total={total} />}
      {loaded && items.length === 0 && isFiltered && <p className="text-muted-foreground">{t('transactions.filters.noMatch')}</p>}
      {loaded && items.length === 0 && !isFiltered && canRecord && <p className="text-muted-foreground">{t('transactions.empty')}</p>}
      {loaded && items.length > 0 && (
        <VirtualRows items={items} itemKey={listKey} label={t('screens.transactions')} onEndReached={loadNextPage}>
          {(transaction, row) => (
            <TransactionRow
              key={listKey(transaction)}
              row={row}
              transaction={transaction}
              account={accounts.data.accounts.find((account) => account.id === transaction.accountId)}
              category={findCategory(categories.data, transaction.categoryId)}
              onEdit={(editing) => setDrawer({ editing })}
            />
          )}
        </VirtualRows>
      )}
      {loaded && isFetchingNextPage && <ListSkeleton label={t('transactions.loadingMore')} />}
      {hasNextPage && isFetchNextPageError && (
        <Button variant="outline" onClick={() => void fetchNextPage()}>
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
            <SheetTitle className="text-lg font-semibold">{editing ? t('transactions.editTitle') : t('transactions.new')}</SheetTitle>
            <SheetClose className={cn('rounded-md p-2 hover:bg-muted', focusRing)} aria-label={t('nav.close')}>
              <X aria-hidden className="size-5" />
            </SheetClose>
          </div>
          {canOpenDrawer && drawer && 'adding' in drawer && (
            <AddTransaction accounts={accounts.data.accounts} categories={categories.data} onClose={() => setDrawer(null)} />
          )}
          {canOpenDrawer && editing && (
            <EditTransaction transaction={editing} accounts={accounts.data.accounts} categories={categories.data} onClose={() => setDrawer(null)} />
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

type RowProps = {
  transaction: ListedTransaction
  account?: Account
  category?: Category
  onEdit: (transaction: Transaction) => void
  /** Where the list has the row, and how it measures it. */
  row: VirtualRow
}

function TransactionRow({ transaction, account, category, onEdit, row }: RowProps) {
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
    <li {...row} className="space-y-2 border-b p-3 last:border-b-0" aria-busy={pending || undefined}>
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

/**
 * The currency with the most decimals, so that an amount in any of them can be typed: the range of amounts
 * is compared with every transaction, whatever currency it is in.
 */
function mostDecimals(currencies: Currency[]): Currency | undefined {
  const decimals = (currency: Currency) => new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 0
  return currencies.toSorted((a, b) => decimals(b) - decimals(a))[0]
}

/** Rows standing in for the list while it loads, or for its next page under the rows already there. */
function ListSkeleton({ label }: { label: string }) {
  return (
    <ul aria-busy aria-label={label} className="divide-y rounded-lg border">
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
