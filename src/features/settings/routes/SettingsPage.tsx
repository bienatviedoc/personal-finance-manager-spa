import { useTranslation } from 'react-i18next'
import { PlaceholderPage } from '@/shared/components/PlaceholderPage'

export function SettingsPage() {
  const { t } = useTranslation()
  return <PlaceholderPage title={t('screens.settings')} />
}
