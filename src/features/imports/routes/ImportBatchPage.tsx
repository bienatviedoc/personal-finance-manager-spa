import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useParams } from 'react-router'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { importBatchQuery, type StartAgain } from '../api/imports'
import { ImportProgress } from '../components/ImportProgress'
import { MapAndPreview } from '../components/MapAndPreview'

/**
 * One uploaded statement (an import batch): mapped and previewed while it is uploaded, then, once committed, the
 * worker's progress importing it and what came of it.
 */
export function ImportBatchPage() {
  const { t } = useTranslation()
  const { batchId = '' } = useParams()
  const batch = useQuery(importBatchQuery(batchId))
  // Started again after an import stopped: its mapping, rather than the API's guess at the layout.
  const kept = (useLocation().state as StartAgain | null)?.mapping
  const startFrom = kept ?? batch.data?.suggestedMapping
  const title = batch.data ? t('imports.batchTitle', { fileName: batch.data.fileName }) : t('screens.import')
  useDocumentTitle(title)

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold break-words">{title}</h1>
        <Link className="text-sm underline" to="/import">
          {t('imports.another')}
        </Link>
      </div>
      {batch.isError && <ErrorMessage>{t('imports.errors.generic')}</ErrorMessage>}
      {batch.isPending && (
        <p aria-busy className="text-muted-foreground">
          {t('imports.loading')}
        </p>
      )}
      {batch.data &&
        (batch.data.status === 'uploaded' && startFrom ? (
          <MapAndPreview batch={batch.data} suggested={startFrom} />
        ) : (
          <ImportProgress batch={batch.data} />
        ))}
    </section>
  )
}
