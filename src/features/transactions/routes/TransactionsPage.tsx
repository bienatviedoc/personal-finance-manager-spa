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
import { useLocale } from '@/shared/i18n/useLocale'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { withMostDecimals } from '@/shared/money'
import { Button } from '@/shared/ui/button'
import { isPending, isTransferLeg, listKey, transactionsQuery, useExportTransactions, type Transaction } from '../api/transactions'
import { EditTransaction } from '../components/EditTransaction'
import { ListSkeleton } from '../components/ListSkeleton'
import { TransactionFilterBar } from '../components/TransactionFilterBar'
import { TransactionRow } from '../components/TransactionRow'
import { TransactionTotal } from '../components/TransactionTotal'
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
  const [drawer, setDrawer] = useState<DrawerFor>(null)
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
      {loaded && items.length > 0 && (
        // Every transaction the filters let through, however many pages are loaded: the API writes the file.
        <Button variant="outline" disabled={exportTransactions.isPending} onClick={exportView}>
          <Download aria-hidden />
          {t('transactions.export.start')}
        </Button>
      )}
      <FailureToast failed={exportTransactions.isError} message={t('transactions.export.failed')} retry={exportView} onDismiss={exportTransactions.reset} />
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
