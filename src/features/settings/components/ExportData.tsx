import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FailureToast } from '@/shared/components/FailureToast'
import { Button } from '@/shared/ui/button'
import { useExportData } from '../api/data'

/** A full export: everything the app holds about the user, downloaded as a ZIP file once they confirm. */
export function ExportData() {
  const { t } = useTranslation()
  const headingId = useId()
  const exportData = useExportData()
  const [confirming, setConfirming] = useState(false)

  const download = async () => {
    const downloaded = await exportData.mutateAsync().then(
      () => true,
      () => false,
    )
    if (downloaded) setConfirming(false)
  }

  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <h3 id={headingId} className="font-semibold">
        {t('settings.data.export.title')}
      </h3>
      <p className="text-sm text-muted-foreground">{t('settings.data.export.body')}</p>
      {confirming ? (
        <div className="space-y-4 rounded-md border p-4">
          <p className="text-sm">{t('settings.data.export.confirmBody')}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={exportData.isPending} onClick={() => void download()}>
              {t('settings.data.export.submit')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                exportData.reset()
                setConfirming(false)
              }}
            >
              {t('settings.security.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            exportData.reset()
            setConfirming(true)
          }}
        >
          {t('settings.data.export.start')}
        </Button>
      )}
      <FailureToast failed={exportData.isError} message={t('settings.security.failed')} retry={() => void download()} onDismiss={exportData.reset} />
      {/* Said until the user asks for another export. */}
      {exportData.isSuccess && !confirming && (
        <p role="status" className="text-sm">
          {t('settings.data.export.downloaded')}
        </p>
      )}
    </section>
  )
}
