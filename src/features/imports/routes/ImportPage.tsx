import { useTranslation } from 'react-i18next'
import { PlaceholderPage } from '@/shared/components/PlaceholderPage'

export function ImportPage() {
  const { t } = useTranslation()
  return <PlaceholderPage title={t('screens.import')} />
}
