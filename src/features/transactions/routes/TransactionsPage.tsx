import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { accountsQuery, type Account } from '@/features/accounts'
import { CategoryBadge, categoriesQuery, findCategory, type Category } from '@/features/categories'
import { RecurringRuleLink } from '@/features/recurring'
import { useUserSettings } from '@/features/settings'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { Drawer } from '@/shared/components/Drawer'
import { FailureToast } from '@/shared/components/FailureToast'
import { formatDate } from '@/shared/dates'
import { useIdempotencyKey } from '@/shared/api/useIdempotencyKey'
import { isStale } from '@/shared/api/versionedSave'
import { useLocale } from '@/shared/i18n/useLocale'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { cn } from '@/shared/lib/utils'
import { Money, withMostDecimals } from '@/shared/money'
import { Button } from '@/shared/ui/button'
import { ArrowRightLeft } from 'lucide-react'
import {
  isPending,
  isTransferLeg,
  isSplit,
  listKey,
  takesFromBalance,
  transactionsQuery,
  useDeleteTransaction,
  useEditTransaction,
  type ListedTransaction,
  type Transaction,
} from '../api/transactions'
import { transferQuery, useCreateTransfer, useDeleteTransfer, useEditTransfer, type Transfer, type TransferFields } from '../api/transfers'
import { Attachments } from '../components/Attachments'
import { TransactionFilterBar } from '../components/TransactionFilterBar'
import { useQuickAdd } from '../components/quickAddContext'
import { TransactionForm } from '../components/TransactionForm'
import { TransactionTotal } from '../components/TransactionTotal'
import { TransferForm } from '../components/TransferForm'
import { VirtualRows, type VirtualRow } from '../components/VirtualRows'
import { useTransactionFilters } from '../hooks/useTransactionFilters'

/**
 * What the drawer is open for: editing this transaction, as it was when the drawer opened, recording a
 * transfer, or editing the transfer with this id, which either of its legs opens.
 */
type Drawer = { editing: Transaction } | { transferring: true } | { transferId: string } | null

/**
 * The user's income, expenses and transfers, narrowed and sorted by the filters in the address, with what they
 * come to, refunds marked as such. Only the rows near the screen are in the page, and the next page is loaded
 * as the last row comes near. Recording and editing happen in a side drawer (spec section 12): editing and
 * transfers in this screen's own, recording a transaction in the one quick add opens on every screen. The list
 * shows a change to income or an expense as soon as it is sent. A transfer is listed as its two legs, each on
 * its own account and marked as a transfer; either opens the transfer form.
 */
export function TransactionsPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('screens.transactions'))
  const [drawer, setDrawer] = useState<Drawer>(null)
  const addTransaction = useQuickAdd()
  const { baseCurrency } = useUserSettings()
  const locale = useLocale()
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
  const open = accounts.data?.accounts.filter((account) => !account.isArchived) ?? []
  const canRecord = open.length > 0
  // A transfer is between two different accounts.
  const canTransfer = open.length > 1
  const drawerTitle =
    drawer && 'transferId' in drawer
      ? t('transfers.editTitle')
      : drawer && 'transferring' in drawer
        ? t('transfers.new')
        : t('transactions.editTitle')
  const loaded = items !== undefined && accounts.data !== undefined && categories.data !== undefined
  const canOpenDrawer = accounts.data !== undefined && categories.data !== undefined
  // Every page carries the total of everything that passes the filters; the last one loaded is the latest word.
  const total = transactions.data?.pages.at(-1)?.total

  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = transactions
  // A page that failed to load is asked for again by the user, not by the list at every render.
  const loadNextPage = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage])

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
          <Button disabled={!canOpenDrawer} aria-keyshortcuts="N" onClick={addTransaction}>
            {t('transactions.add')}
          </Button>
          {canTransfer && (
            <Button variant="outline" disabled={!canOpenDrawer} onClick={() => setDrawer({ transferring: true })}>
              <ArrowRightLeft aria-hidden />
              {t('transfers.add')}
            </Button>
          )}
        </div>
      )}

      {accounts.data && categories.data && (
        <TransactionFilterBar
          view={view}
          isFiltered={isFiltered}
          onChange={change}
          onClear={clear}
          accounts={accounts.data.accounts}
          categories={categories.data}
          // The range of amounts is compared with every transaction, whatever currency it is in.
          fallbackCurrency={withMostDecimals(accounts.data.accounts.map((account) => account.currency), locale) ?? baseCurrency}
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
              categories={categories.data}
              onEdit={(editing) => setDrawer(isTransferLeg(editing) ? { transferId: editing.transferId } : { editing })}
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

      <Drawer open={drawer !== null} onOpenChange={(open) => !open && setDrawer(null)} title={drawerTitle}>
          {canOpenDrawer && editing && (
            <EditTransaction transaction={editing} accounts={accounts.data.accounts} categories={categories.data} onClose={() => setDrawer(null)} />
          )}
          {canOpenDrawer && drawer && 'transferring' in drawer && <AddTransfer accounts={accounts.data.accounts} onClose={() => setDrawer(null)} />}
          {canOpenDrawer && drawer && 'transferId' in drawer && (
            <OpenTransfer id={drawer.transferId} accounts={accounts.data.accounts} onClose={() => setDrawer(null)} />
          )}
      </Drawer>
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
      <Attachments transactionId={transaction.id} />
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

type RowProps = {
  transaction: ListedTransaction
  account?: Account
  /** The transaction's category; of a split, its first line's. */
  category?: Category
  /** The user's category tree, to name the category of each line of a split. */
  categories: Category[]
  onEdit: (transaction: Transaction) => void
  /** Where the list has the row, and how it measures it. */
  row: VirtualRow
}

function TransactionRow({ transaction, account, category, categories, onEdit, row }: RowProps) {
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

  return (
    <li {...row} className="space-y-2 border-b p-3 last:border-b-0" aria-busy={pending || undefined}>
      <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', pending && 'opacity-60')}>
        {category && !split && <CategoryBadge icon={category.icon} color={category.color} />}
        {leg && (
          <span aria-hidden data-testid="transfer-mark" className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
            <ArrowRightLeft className="size-4" />
          </span>
        )}
        <div className="min-w-24 flex-1">
          <h2 className="font-medium break-words">{title}</h2>
          {transaction.isRefund && (
            <span className="inline-block rounded-full border border-emerald-600/40 bg-emerald-600/10 px-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              {t('transactions.refund')}
            </span>
          )}
          <p data-testid="details" className="text-sm text-muted-foreground">
            {[leg ? t('transfers.mark') : split ? t('transactions.split.label') : category?.name, account?.name, formatDate(transaction.date, locale)]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {split && (
            <ul aria-label={t('transactions.split.linesOf', { name: title })} className="text-sm text-muted-foreground">
              {transaction.lines.map((line, index) => (
                // Lines have no id of their own; their order is theirs.
                <li key={index} className="break-words">
                  {findCategory(categories, line.categoryId)?.name}
                  {separator}
                  <Money amount={line.amount} currency={transaction.currency} />
                  {line.note && separator + line.note}
                </li>
              ))}
            </ul>
          )}
          {transaction.note && <p className="text-sm break-words text-muted-foreground">{transaction.note}</p>}
          {transaction.recurringRuleId && <RecurringRuleLink ruleId={transaction.recurringRuleId} />}
        </div>
        <span data-testid="amount" className="font-medium tabular-nums">
          {/* The type gives the sign, except that a refund is an expense coming back. Putting it in front of the digits is not arithmetic. */}
          {transaction.isRefund && '+'}
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

/** What stands between the parts of one line of details. */
const separator = ' · '

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
