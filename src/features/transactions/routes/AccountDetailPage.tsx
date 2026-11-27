import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { accountsQuery, findAccount, type Account } from '@/features/accounts'
import { categoriesQuery, findCategory, type Category } from '@/features/categories'
import { AccountBalance } from '@/features/reports'
import { useUserSettings } from '@/features/settings'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { shiftDate, todayIn } from '@/shared/dates'
import { detailSeparator } from '@/shared/lib/details'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { Money } from '@/shared/money'
import { Button } from '@/shared/ui/button'
import { listKey, transactionsQuery } from '../api/transactions'
import { ListSkeleton } from '../components/ListSkeleton'
import { TransactionDrawer } from '../components/TransactionDrawer'
import { TransactionRow } from '../components/TransactionRow'
import { VirtualRows } from '../components/VirtualRows'
import { useLoadNextPage } from '../hooks/useLoadNextPage'
import { useTransactionDrawer } from '../hooks/useTransactionDrawer'

/** How many days, up to today, the balance chart shows. */
const chartedDays = 90

/**
 * One account (spec section 12, `/accounts/:id`): its balance, how that balance moved over the last 90 days as a
 * chart or a table (cash flow, spec RPT-4, in the account's own currency), its transactions newest first, edited in
 * a side drawer as on the transactions screen, and the way on to reconciling it, to all its transactions with the
 * filters, and to its cash flow report over any period. An archived account offers no reconciling.
 */
export function AccountDetailPage() {
  const { t } = useTranslation()
  const { accountId = '' } = useParams()
  const { timeZone } = useUserSettings()
  // Archived accounts are loaded too: an archived account keeps its page and history.
  const accounts = useQuery(accountsQuery({ includeArchived: true }))
  const categories = useQuery(categoriesQuery({ includeArchived: true }))
  const allAccounts = accounts.data?.accounts
  const account = allAccounts ? findAccount(allAccounts, accountId) : undefined
  useDocumentTitle(account?.name ?? t('screens.accountDetail'))
  const to = todayIn(timeZone)
  const from = shiftDate(to, -(chartedDays - 1))

  return (
    <section className="max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold break-words">{account?.name ?? t('screens.accountDetail')}</h1>
        <Link className="text-sm underline" to="/accounts">
          {t('accountDetail.toAccounts')}
        </Link>
      </div>

      {accounts.isError && <ErrorMessage>{t('accountDetail.errors.notLoaded')}</ErrorMessage>}
      {accounts.data && !account && <p className="text-muted-foreground">{t('accountDetail.notFound')}</p>}

      {account && (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="min-w-24 flex-1">
              <p className="text-sm text-muted-foreground">
                {t(`accounts.types.${account.type}`)}
                {account.isArchived && (
                  <>
                    {detailSeparator}
                    <span>{t('accounts.archived')}</span>
                  </>
                )}
              </p>
              <p data-testid="balance" className="text-lg font-medium tabular-nums">
                <Money amount={account.balance} currency={account.currency} />
              </p>
            </div>
            {!account.isArchived && (
              <Button asChild variant="outline" size="sm">
                <Link aria-label={t('accounts.reconcileNamed', { name: account.name })} to={`/accounts/${account.id}/reconcile`}>
                  {t('accounts.reconcile')}
                </Link>
              </Button>
            )}
          </div>

          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">{t('accountDetail.balance')}</h2>
              <Link className="text-sm underline" to={`/reports/cash-flow?accountId=${account.id}`}>
                {t('accountDetail.cashFlow', { name: account.name })}
              </Link>
            </div>
            <Suspense fallback={<ListSkeleton label={t('accountDetail.loadingBalance')} />}>
              <AccountBalance accountId={account.id} from={from} to={to} label={t('accountDetail.balanceChart', { name: account.name, days: chartedDays })} />
            </Suspense>
          </section>

          {/* The transactions are named by category, so without them there is no list to show. */}
          {categories.isError && <ErrorMessage>{t('accountDetail.errors.transactionsNotLoaded')}</ErrorMessage>}
          {categories.data && allAccounts && (
            <AccountTransactions accountId={account.id} name={account.name} categories={categories.data} accounts={allAccounts} />
          )}
        </>
      )}
    </section>
  )
}

type TransactionsProps = {
  accountId: string
  name: string
  categories: Category[]
  /** Every account, archived ones too, to name the other account of a transfer and to edit on. */
  accounts: Account[]
}

/** The account's transactions, newest first, a page at a time as the list comes near its end. */
function AccountTransactions({ accountId, name, categories, accounts }: TransactionsProps) {
  const { t } = useTranslation()
  const transactions = useInfiniteQuery(transactionsQuery({ accountId }))
  const items = transactions.data?.pages.flatMap((page) => page.items)
  const drawer = useTransactionDrawer(items)
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = transactions
  const loadNextPage = useLoadNextPage(transactions)

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{t('accountDetail.transactions')}</h2>
        <Link className="text-sm underline" to={`/transactions?accountId=${accountId}`}>
          {t('accountDetail.allTransactions', { name })}
        </Link>
      </div>
      {transactions.isError && <ErrorMessage>{t('transactions.errors.generic')}</ErrorMessage>}
      {!items && !transactions.isError && <ListSkeleton label={t('transactions.loading')} />}
      {items?.length === 0 && <p className="text-muted-foreground">{t('accountDetail.noTransactions')}</p>}
      {items && items.length > 0 && (
        <VirtualRows items={items} itemKey={listKey} label={t('accountDetail.transactionsOn', { name })} onEndReached={loadNextPage}>
          {(transaction, row) => (
            <TransactionRow
              key={listKey(transaction)}
              row={row}
              transaction={transaction}
              account={findAccount(accounts, transaction.accountId)}
              category={findCategory(categories, transaction.categoryId)}
              categories={categories}
              onEdit={drawer.edit}
            />
          )}
        </VirtualRows>
      )}
      {isFetchingNextPage && <ListSkeleton label={t('transactions.loadingMore')} />}
      {hasNextPage && isFetchNextPageError && (
        <Button variant="outline" onClick={() => void fetchNextPage()}>
          {t('transactions.loadMore')}
        </Button>
      )}

      <TransactionDrawer openFor={drawer.openFor} editing={drawer.editing} accounts={accounts} categories={categories} onClose={drawer.close} />
    </section>
  )
}
