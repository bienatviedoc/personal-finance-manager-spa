import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { accountsQuery, findAccount } from '@/features/accounts'
import { categoriesQuery, findCategory } from '@/features/categories'
import { useUserSettings } from '@/features/settings'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { FailureToast } from '@/shared/components/FailureToast'
import { formatDate, todayIn } from '@/shared/dates'
import { useLocale } from '@/shared/i18n/useLocale'
import { detailSeparator, joinDetails } from '@/shared/lib/details'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { Money, signedAmount } from '@/shared/money'
import { Button } from '@/shared/ui/button'
import { recentlyDeletedQuery, useRestoreTransaction, type DeletedTransaction } from '../api/recentlyDeleted'
import { isSplit, takesFromBalance } from '../api/transactions'
import { ListSkeleton } from '../components/ListSkeleton'

/**
 * The transactions the user deleted in the last 30 days (spec section 3, rule 10), the last deleted first, each
 * with when it can be restored until. Restoring one returns it to the lists and its account's balance; restoring
 * a leg of a transfer restores the whole transfer. After 30 days the API removes one for good.
 */
export function RecentlyDeletedPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('transactions.recentlyDeleted.title'))
  const deleted = useInfiniteQuery(recentlyDeletedQuery)
  // Archived accounts and categories are loaded too: a deleted transaction on one still shows its name.
  const accounts = useQuery(accountsQuery({ includeArchived: true }))
  const categories = useQuery(categoriesQuery({ includeArchived: true }))
  const items = deleted.data?.pages.flatMap((page) => page.items)
  const loaded = items !== undefined && accounts.data !== undefined && categories.data !== undefined

  return (
    <section className="max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{t('transactions.recentlyDeleted.title')}</h1>
        <p className="text-muted-foreground">{t('transactions.recentlyDeleted.intro')}</p>
        <Link className="text-sm underline" to="/transactions">
          {t('transactions.recentlyDeleted.back')}
        </Link>
      </div>

      {(deleted.isError || accounts.isError || categories.isError) && <ErrorMessage>{t('transactions.recentlyDeleted.notLoaded')}</ErrorMessage>}
      {!loaded && !deleted.isError && <ListSkeleton label={t('transactions.recentlyDeleted.loading')} />}
      {loaded && items.length === 0 && <p className="text-muted-foreground">{t('transactions.recentlyDeleted.empty')}</p>}
      {loaded && items.length > 0 && (
        <ul aria-label={t('transactions.recentlyDeleted.title')} className="rounded-md border">
          {items.map((transaction) => (
            <DeletedRow
              key={transaction.id}
              transaction={transaction}
              accountName={findAccount(accounts.data.accounts, transaction.accountId)?.name}
              categoryName={findCategory(categories.data, transaction.categoryId)?.name}
            />
          ))}
        </ul>
      )}
      {deleted.hasNextPage && (
        <Button variant="outline" disabled={deleted.isFetchingNextPage} onClick={() => void deleted.fetchNextPage()}>
          {t('transactions.loadMore')}
        </Button>
      )}
    </section>
  )
}

type RowProps = { transaction: DeletedTransaction; accountName?: string; categoryName?: string }

function DeletedRow({ transaction, accountName, categoryName }: RowProps) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { timeZone } = useUserSettings()
  const restore = useRestoreTransaction()
  const leg = transaction.transferId !== null
  const split = isSplit(transaction)
  const title = transaction.payee ?? (split ? t('transactions.split.transaction') : categoryName) ?? t(`transactions.types.${transaction.type}`)
  // When it can be restored until, on the user's calendar.
  const until = formatDate(todayIn(timeZone, new Date(transaction.restorableUntil)), locale)

  return (
    <li className="space-y-1 border-b p-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-24 flex-1">
          <h2 className="font-medium break-words">{title}</h2>
          <p data-testid="details" className="text-sm text-muted-foreground">
            {joinDetails([leg ? t('transfers.mark') : split ? t('transactions.split.label') : categoryName, accountName, formatDate(transaction.date, locale)])}
            {detailSeparator}
            {transaction.isRefund && '+'}
            <Money amount={signedAmount(transaction.amount, takesFromBalance(transaction))} currency={transaction.currency} />
            {detailSeparator}
            {t('transactions.recentlyDeleted.restorableUntil', { date: until })}
          </p>
          {leg && <p className="text-sm text-muted-foreground">{t('transactions.recentlyDeleted.wholeTransfer')}</p>}
        </div>
        <Button
          variant="outline"
          size="sm"
          aria-label={t('transactions.recentlyDeleted.restoreNamed', { name: title })}
          disabled={restore.isPending}
          onClick={() => restore.mutate(transaction.id)}
        >
          {t('transactions.recentlyDeleted.restore')}
        </Button>
      </div>
      <FailureToast
        failed={restore.isError}
        message={t('transactions.recentlyDeleted.notRestored')}
        retry={() => restore.mutate(transaction.id)}
        onDismiss={restore.reset}
      />
    </li>
  )
}
