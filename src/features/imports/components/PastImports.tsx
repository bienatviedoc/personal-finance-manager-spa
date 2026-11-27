import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { accountsQuery } from '@/features/accounts'
import { useUserSettings } from '@/features/settings'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { formatDate, todayIn } from '@/shared/dates'
import { useLocale } from '@/shared/i18n/useLocale'
import { joinDetails } from '@/shared/lib/details'
import { Button } from '@/shared/ui/button'
import { pastImportsQuery, type ImportBatch } from '../api/imports'
import { UndoImport } from './UndoImport'

/**
 * The statements the user imported, the last first: each with its file name, account, the day it was uploaded, where
 * it got to and its counts, as the API answers them, and the offer to undo it (spec IMP-5).
 */
export function PastImports() {
  const { t } = useTranslation()
  const past = useInfiniteQuery(pastImportsQuery)
  const batches = past.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <section aria-labelledby="past-imports" className="space-y-3">
      <h2 id="past-imports" className="text-lg font-semibold">
        {t('imports.history.title')}
      </h2>
      {past.isError && <ErrorMessage>{t('imports.history.notLoaded')}</ErrorMessage>}
      {past.isSuccess && batches.length === 0 && <p className="text-muted-foreground">{t('imports.history.none')}</p>}
      {batches.length > 0 && (
        <ul aria-label={t('imports.history.title')} className="rounded-lg border">
          {batches.map((batch) => (
            <PastImport key={batch.id} batch={batch} />
          ))}
        </ul>
      )}
      {past.hasNextPage && (
        <Button variant="outline" disabled={past.isFetchingNextPage} onClick={() => void past.fetchNextPage()}>
          {t('imports.history.more')}
        </Button>
      )}
    </section>
  )
}

function PastImport({ batch }: { batch: ImportBatch }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { timeZone } = useUserSettings()
  const accounts = useQuery(accountsQuery())
  const account = accounts.data?.accounts.find((candidate) => candidate.id === batch.accountId)

  return (
    <li className="space-y-2 border-b p-3 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 space-y-1">
          <h3 className="font-medium break-words">
            <Link className="underline" to={`/import/${batch.id}`}>
              {batch.fileName}
            </Link>
          </h3>
          <p className="text-sm text-muted-foreground">
            {joinDetails([account?.name, formatDate(todayIn(timeZone, new Date(batch.createdAt)), locale), t(`imports.history.status.${batch.status}`)])}
          </p>
          <p className="text-sm">
            {joinDetails([
              t('imports.history.imported', { count: Number(batch.importedCount) }),
              Number(batch.duplicateCount) > 0 && t('imports.history.skippedDuplicates', { count: Number(batch.duplicateCount) }),
              Number(batch.failedCount) > 0 && t('imports.history.failed', { count: Number(batch.failedCount) }),
            ])}
          </p>
          {batch.status === 'undone' && (
            <p className="text-sm text-muted-foreground">
              {t('imports.history.undoneNote')}{' '}
              <Link className="underline" to="/transactions/deleted">
                {t('imports.recentlyDeleted')}
              </Link>
            </p>
          )}
        </div>
        <UndoImport batch={batch} />
      </div>
    </li>
  )
}
