import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { refreshTransactions } from '@/features/transactions'
import type { ImportBatch, StartAgain } from '../api/imports'

/**
 * A committed statement while the API's worker imports it, a few rows at a time, and once it is done (spec
 * section 5: a background job with progress). The batch is asked for every second meanwhile; once it is done or
 * stopped, everything its transactions show in is loaded again: the lists, balances, budgets and reports. A stopped
 * import says why, from the API's code, and offers to start again with a new upload, keeping the account and mapping.
 */
export function ImportProgress({ batch }: { batch: ImportBatch }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const finished = batch.status === 'committed' || batch.status === 'failed'

  useEffect(() => {
    if (finished) void refreshTransactions(queryClient)
  }, [finished, queryClient])

  if (batch.status === 'committing') {
    const [imported, count] = [Number(batch.importedCount), Number(batch.selectedCount)]
    const percent = count === 0 ? 0 : Math.floor((imported * 100) / count)
    return (
      <div className="max-w-2xl space-y-2">
        <div
          role="progressbar"
          aria-label={t('imports.progress.label')}
          aria-valuemin={0}
          aria-valuemax={count}
          aria-valuenow={imported}
          className="h-3 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
        </div>
        <p aria-live="polite">{t('imports.progress.count', { imported, count })}</p>
      </div>
    )
  }

  return (
    <div role="status" className="max-w-2xl space-y-2 rounded-lg border p-4">
      {batch.status === 'committed' ? (
        <>
          <p className="font-medium">{t('imports.done.imported', { count: batch.importedCount })}</p>
          {Number(batch.duplicateCount) > 0 && <p>{t('imports.done.skippedDuplicates', { count: batch.duplicateCount })}</p>}
          {Number(batch.failedCount) > 0 && <p>{t('imports.done.failed', { count: batch.failedCount })}</p>}
        </>
      ) : (
        <>
          <p className="text-destructive">{t('imports.done.stopped', { imported: batch.importedCount, count: batch.selectedCount })}</p>
          {batch.failure && <p>{t(`imports.failures.${batch.failure}`)}</p>}
        </>
      )}
      <div className="flex flex-wrap gap-4">
        <Link className="underline" to={`/transactions?accountId=${batch.accountId}`}>
          {t('imports.done.seeTransactions')}
        </Link>
        {batch.status === 'failed' && (
          <Link
            className="underline"
            to="/import"
            state={{ accountId: batch.failure === 'accountArchived' ? undefined : batch.accountId, mapping: batch.mapping } satisfies StartAgain}
          >
            {t('imports.done.startAgain')}
          </Link>
        )}
      </div>
    </div>
  )
}
