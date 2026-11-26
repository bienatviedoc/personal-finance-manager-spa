import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { ArrowRightLeft, Download } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { accountsQuery, findAccount } from '@/features/accounts'
import { categoriesQuery, findCategory } from '@/features/categories'
import { useUserSettings } from '@/features/settings'
import { Drawer } from '@/shared/components/Drawer'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { FailureToast } from '@/shared/components/FailureToast'
import { maxBulkSelection } from '@/shared/api/limits'
import { useLocale } from '@/shared/i18n/useLocale'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { withMostDecimals } from '@/shared/money'
import { Button } from '@/shared/ui/button'
import { tagsQuery } from '../api/tags'
import type { BulkFilter, BulkSelection } from '../api/bulk'
import { canBePicked, isPending, isTransferLeg, listKey, transactionsQuery, useExportTransactions, type Transaction, type TransactionFilters } from '../api/transactions'
import { BulkActions } from '../components/BulkActions'
import { EditTransaction } from '../components/EditTransaction'
import { MarkAsTransfer } from '../components/MarkAsTransfer'
import { ListSkeleton } from '../components/ListSkeleton'
import { TransactionFilterBar } from '../components/TransactionFilterBar'
import { TransactionRow } from '../components/TransactionRow'
import { TransactionTotal } from '../components/TransactionTotal'
import { transactionTitle } from '../components/transactionTitle'
import { AddTransfer, OpenTransfer } from '../components/TransferDrawer'
import { useQuickAdd } from '../components/quickAddContext'
import { VirtualRows } from '../components/VirtualRows'
import { useTransactionFilters } from '../hooks/useTransactionFilters'

/**
 * What the drawer is open for: editing this transaction, as it was when the drawer opened, recording a
 * transfer, or editing the transfer with this id, which either of its legs opens.
 */
type DrawerFor = { editing: Transaction } | { transferring: true } | { transferId: string } | null

/**
 * What is selected: transactions picked one by one, as they were when picked, or every one that passes the
 * filters of a view, written as `filtersKey` writes them, loaded or not.
 */
type Selection = { rows: Transaction[] } | { allOf: string }

/** The filters of a view, without its sort order, which selects nothing. */
const filterOf = ({ from, to, accountId, categoryId, type, min, max, q, tag }: TransactionFilters): BulkFilter => ({
  from,
  to,
  accountId,
  categoryId,
  type,
  min,
  max,
  q,
  tag,
})
const filtersKey = (view: TransactionFilters) => JSON.stringify(filterOf(view))

/**
 * The user's income, expenses and transfers, narrowed and sorted by the filters in the address, with what they
 * come to, refunds marked as such. Only the rows near the screen are in the page, and the next page is loaded
 * as the last row comes near. Recording and editing happen in a side drawer (spec section 12): editing and
 * transfers in this screen's own, recording a transaction in the one quick add opens on every screen. The list
 * shows a change to income or an expense as soon as it is sent. A transfer is listed as its two legs, each on
 * its own account and marked as a transfer; either opens the transfer form. Transactions selected in the list, one
 * by one or every one that passes the filters, take a bulk action together; an expense and income selected can be
 * marked as one transfer.
 */
export function TransactionsPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('screens.transactions'))
  const [drawer, setDrawer] = useState<DrawerFor>(null)
  const [selection, setSelection] = useState<Selection>({ rows: [] })
  const addTransaction = useQuickAdd()
  const { baseCurrency } = useUserSettings()
  const locale = useLocale()
  const { view, isFiltered, change, clear } = useTransactionFilters()
  const transactions = useInfiniteQuery(transactionsQuery(view))
  const exportTransactions = useExportTransactions()
  const exportView = () => exportTransactions.mutate(view)
  // Archived accounts and categories are loaded too: the transactions on them still show their names.
  const accounts = useQuery(accountsQuery({ includeArchived: true }))
  const categories = useQuery(categoriesQuery({ includeArchived: true }))
  const tags = useQuery(tagsQuery)

  const items = transactions.data?.pages.flatMap((page) => page.items)
  // Every page carries the total of everything that passes the filters; the last one loaded is the latest word.
  const total = transactions.data?.pages.at(-1)?.total
  // The transaction being edited is read from the list, to follow a newer version loaded while the drawer is
  // open. An edit shown ahead of the API's answer can move it past the pages loaded so far (an earlier date):
  // the drawer then keeps the one it was opened for, so the form and what its save answers are not lost.
  const editing =
    drawer && 'editing' in drawer
      ? (items?.find((transaction): transaction is Transaction => !isPending(transaction) && transaction.id === drawer.editing.id) ?? drawer.editing)
      : undefined
  // Every transaction that passes the filters, while the view is still the one they were selected under.
  const allSelected = 'allOf' in selection && selection.allOf === filtersKey(view)
  // Picked one by one, they stay selected as they were where a filter now hides them, so an expense can be picked
  // under one account's filter and income under another's to mark as a transfer.
  const pickedRows = 'rows' in selection ? selection.rows : []
  const saved = items?.filter((transaction): transaction is Transaction => !isPending(transaction)) ?? []
  // What is picked, as the list has it now where it shows it: one that has since become a leg or a refund is not.
  const picked = pickedRows.map((row) => saved.find((transaction) => transaction.id === row.id) ?? row)
  const isSelected = (id: string) => allSelected || pickedRows.some((row) => row.id === id)
  const toggleSelected = (transaction: Transaction) =>
    setSelection(() => {
      // Unselecting one of all of them leaves the others loaded selected, one by one.
      const rows = allSelected ? saved : pickedRows
      return { rows: rows.some((row) => row.id === transaction.id) ? rows.filter((row) => row.id !== transaction.id) : [...rows, transaction] }
    })
  const clearSelection = useCallback(() => setSelection({ rows: [] }), [])
  // Marking as a transfer is offered while what was picked could become one: one or two income or expenses.
  const marking = !allSelected && pickedRows.length > 0 && pickedRows.length <= 2 && pickedRows.every(canBePicked)
  const selectedCount = allSelected ? Number(total?.count ?? 0) : pickedRows.length
  const bulkSelection: BulkSelection = allSelected ? { filter: filterOf(view) } : { transactionIds: pickedRows.map((row) => row.id) }
  const nameOf = (id: string) => {
    const transaction = saved.find((candidate) => candidate.id === id) ?? pickedRows.find((row) => row.id === id)
    return transaction ? transactionTitle(transaction, findCategory(categories.data ?? [], transaction.categoryId), t) : t('transactions.bulk.unknown')
  }
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
        <Link className="text-sm underline" to="/transactions/deleted">
          {t('transactions.recentlyDeleted.title')}
        </Link>
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
          tags={tags.data ?? []}
          // The range of amounts is compared with every transaction, whatever currency it is in.
          fallbackCurrency={withMostDecimals(accounts.data.accounts.map((account) => account.currency), locale) ?? baseCurrency}
        />
      )}

      {(transactions.isError || accounts.isError || categories.isError) && <ErrorMessage>{t('transactions.errors.generic')}</ErrorMessage>}
      {!loaded && !transactions.isError && <ListSkeleton label={t('transactions.loading')} />}
      {loaded && total && items.length > 0 && <TransactionTotal total={total} />}
      {loaded && items.length > 0 && (
        // Every transaction the filters let through, however many pages are loaded: the API writes the file.
        <Button variant="outline" disabled={exportTransactions.isPending} onClick={exportView}>
          <Download aria-hidden />
          {t('transactions.export.start')}
        </Button>
      )}
      <FailureToast failed={exportTransactions.isError} message={t('transactions.export.failed')} retry={exportView} onDismiss={exportTransactions.reset} />
      {loaded && items.length > 0 && total && Number(total.count) > maxBulkSelection && (
        <p className="text-sm text-muted-foreground">
          {t('transactions.bulk.tooManyToSelect', { count: Number(total.count), total: Number(total.count).toLocaleString(locale), max: maxBulkSelection.toLocaleString(locale) })}
        </p>
      )}
      {loaded && items.length > 0 && total && Number(total.count) <= maxBulkSelection && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={allSelected}
            onChange={() => setSelection(allSelected ? { rows: [] } : { allOf: filtersKey(view) })}
          />
          {t('transactions.bulk.selectAll', { count: total.count })}
        </label>
      )}
      {accounts.data && categories.data && selectedCount > 0 && (
        <BulkActions
          count={selectedCount}
          selection={bulkSelection}
          accounts={accounts.data.accounts}
          categories={categories.data}
          nameOf={nameOf}
          onDone={clearSelection}
          onClear={clearSelection}
        />
      )}
      {/* Started again for each new pick, so what the last attempt said is not shown for another pair. */}
      {marking && <MarkAsTransfer key={pickedRows.map((row) => row.id).join()} picked={picked.filter(canBePicked)} onClear={clearSelection} />}
      {loaded && items.length === 0 && isFiltered && <p className="text-muted-foreground">{t('transactions.filters.noMatch')}</p>}
      {loaded && items.length === 0 && !isFiltered && canRecord && <p className="text-muted-foreground">{t('transactions.empty')}</p>}
      {loaded && items.length > 0 && (
        <VirtualRows items={items} itemKey={listKey} label={t('screens.transactions')} onEndReached={loadNextPage}>
          {(transaction, row) => (
            <TransactionRow
              key={listKey(transaction)}
              row={row}
              transaction={transaction}
              account={findAccount(accounts.data.accounts, transaction.accountId)}
              category={findCategory(categories.data, transaction.categoryId)}
              categories={categories.data}
              onEdit={(editing) => setDrawer(isTransferLeg(editing) ? { transferId: editing.transferId } : { editing })}
              select={isPending(transaction) ? undefined : { selected: isSelected(transaction.id), onToggle: () => toggleSelected(transaction) }}
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
          <OpenTransfer id={drawer.transferId} accounts={accounts.data.accounts} categories={categories.data} onClose={() => setDrawer(null)} />
        )}
      </Drawer>
    </section>
  )
}
