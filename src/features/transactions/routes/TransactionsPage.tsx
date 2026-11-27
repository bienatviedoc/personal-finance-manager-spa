import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { ArrowRightLeft, Download } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { accountsQuery, findAccount } from '@/features/accounts'
import { categoriesQuery, findCategory } from '@/features/categories'
import { useUserSettings } from '@/features/settings'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { FailureToast } from '@/shared/components/FailureToast'
import { maxBulkSelection } from '@/shared/api/limits'
import { useLocale } from '@/shared/i18n/useLocale'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { cn, focusRing } from '@/shared/lib/utils'
import { withMostDecimals } from '@/shared/money'
import { Button } from '@/shared/ui/button'
import { tagsQuery } from '../api/tags'
import { canBePicked, isPending, listKey, transactionsQuery, useExportTransactions, type Transaction } from '../api/transactions'
import { BulkActions } from '../components/BulkActions'
import { MarkAsTransfer } from '../components/MarkAsTransfer'
import { ListSkeleton } from '../components/ListSkeleton'
import { TransactionFilterBar } from '../components/TransactionFilterBar'
import { TransactionRow } from '../components/TransactionRow'
import { TransactionTotal } from '../components/TransactionTotal'
import { transactionTitle } from '../components/transactionTitle'
import { TransactionDrawer } from '../components/TransactionDrawer'
import { useQuickAdd } from '../components/quickAddContext'
import { VirtualRows } from '../components/VirtualRows'
import { useLoadNextPage } from '../hooks/useLoadNextPage'
import { useSelection } from '../hooks/useSelection'
import { useTransactionDrawer } from '../hooks/useTransactionDrawer'
import { useTransactionFilters } from '../hooks/useTransactionFilters'

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
  const drawer = useTransactionDrawer(items)
  const saved = items?.filter((transaction): transaction is Transaction => !isPending(transaction)) ?? []
  const selection = useSelection(view, saved, total)
  // What the last bulk action did, said where focus lands once its panel closes with the selection.
  const [bulkDone, setBulkDone] = useState<number>()
  const bulkDoneMessage = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (bulkDone !== undefined) bulkDoneMessage.current?.focus()
  }, [bulkDone])
  const finishBulk = (count: number) => {
    selection.clear()
    setBulkDone(count)
  }
  const nameOf = (id: string) => {
    const transaction = saved.find((candidate) => candidate.id === id) ?? selection.pickedRows.find((row) => row.id === id)
    return transaction ? transactionTitle(transaction, findCategory(categories.data ?? [], transaction.categoryId), t) : t('transactions.bulk.unknown')
  }
  const open = accounts.data?.accounts.filter((account) => !account.isArchived) ?? []
  const canRecord = open.length > 0
  // A transfer is between two different accounts.
  const canTransfer = open.length > 1
  const loaded = items !== undefined && accounts.data !== undefined && categories.data !== undefined
  const canOpenDrawer = accounts.data !== undefined && categories.data !== undefined

  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = transactions
  const loadNextPage = useLoadNextPage(transactions)

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
            <Button variant="outline" disabled={!canOpenDrawer} onClick={() => drawer.open({ transferring: true })}>
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
            className={cn('size-4', focusRing)}
            checked={selection.allSelected}
            onChange={selection.toggleAll}
          />
          {t('transactions.bulk.selectAll', { count: Number(total.count), total: Number(total.count).toLocaleString(locale) })}
        </label>
      )}
      {accounts.data && categories.data && selection.count > 0 && (
        <BulkActions
          count={selection.count}
          selection={selection.bulk}
          accounts={accounts.data.accounts}
          categories={categories.data}
          nameOf={nameOf}
          onDone={finishBulk}
          onClear={selection.clear}
        />
      )}
      {bulkDone !== undefined && selection.count === 0 && (
        <p ref={bulkDoneMessage} role="status" tabIndex={-1} className={cn('text-sm', focusRing)}>
          {t('transactions.bulk.done', { count: bulkDone, total: bulkDone.toLocaleString(locale) })}
        </p>
      )}
      {/* Started again for each new pick, so what the last attempt said is not shown for another pair. */}
      {selection.marking && (
        <MarkAsTransfer key={selection.pickedRows.map((row) => row.id).join()} picked={selection.picked.filter(canBePicked)} onClear={selection.clear} />
      )}
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
              onEdit={drawer.edit}
              select={isPending(transaction) ? undefined : { selected: selection.isSelected(transaction.id), onToggle: () => selection.toggle(transaction) }}
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

      <TransactionDrawer openFor={drawer.openFor} editing={drawer.editing} accounts={accounts.data?.accounts} categories={categories.data} onClose={drawer.close} />
    </section>
  )
}
