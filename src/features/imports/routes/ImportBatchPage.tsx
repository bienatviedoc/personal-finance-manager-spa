import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { importBatchQuery } from '../api/imports'
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
        (batch.data.status === 'uploaded' && batch.data.suggestedMapping ? (
          <MapAndPreview batch={batch.data} suggested={batch.data.suggestedMapping} />
        ) : (
          <ImportProgress batch={batch.data} />
        ))}
    </section>
  )
}
