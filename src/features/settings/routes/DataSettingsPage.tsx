import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { DeleteUser } from '../components/DeleteUser'
import { ExportData } from '../components/ExportData'

/** What the user may do with everything the app holds about them: download it, and delete themselves. */
export function DataSettingsPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('settings.data.title'))

  return (
    <div className="max-w-md space-y-8">
      <h2 className="text-lg font-semibold">{t('settings.data.title')}</h2>
      <ExportData />
      <DeleteUser />
    </div>
  )
}
