import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { FailureToast } from '@/shared/components/FailureToast'
import { Button } from '@/shared/ui/button'
import { useUndoImport, type ImportBatch } from '../api/imports'

/**
 * Undoing an import once the user confirms (spec IMP-5): every transaction it created is deleted, edited or not, and
 * can be restored from Recently deleted for 30 days. The API refuses while any of them is reconciled, and says how
 * many; nothing is undone then. Offered for a statement committed, being imported (which stops it) or stopped.
 */
export function UndoImport({ batch }: { batch: ImportBatch }) {
  const { t } = useTranslation()
  const undo = useUndoImport()
  const [confirming, setConfirming] = useState(false)
  const reconciled = undo.data && !undo.data.undone ? undo.data.reconciled : 0

  if (batch.status === 'uploaded' || batch.status === 'undone') return null

  const onUndo = () => {
    // A request that failed is shown by the toast below.
    undo.mutateAsync(batch.id).then(
      (outcome) => outcome.undone && setConfirming(false),
      () => undefined,
    )
  }

  return (
    <div className="space-y-2">
      {confirming ? (
        <div role="group" aria-label={t('imports.undo.named', { fileName: batch.fileName })} className="space-y-2 rounded-md bg-muted p-3">
          <p className="text-sm">{t('imports.undo.explained', { count: Number(batch.importedCount) })}</p>
          {reconciled > 0 && <ErrorMessage>{t('imports.undo.reconciled', { count: reconciled })}</ErrorMessage>}
          <div className="flex flex-wrap gap-2">
            <Button variant="destructive" size="sm" disabled={undo.isPending} onClick={onUndo}>
              {t('imports.undo.confirm')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
              {t('imports.undo.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" aria-label={t('imports.undo.named', { fileName: batch.fileName })} onClick={() => setConfirming(true)}>
          {t('imports.undo.action')}
        </Button>
      )}
      <FailureToast failed={undo.isError} message={t('imports.undo.failed')} retry={onUndo} onDismiss={undo.reset} />
    </div>
  )
}
