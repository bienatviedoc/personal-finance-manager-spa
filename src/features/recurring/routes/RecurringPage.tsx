import { useTranslation } from 'react-i18next'
import { PlaceholderPage } from '@/shared/components/PlaceholderPage'

export function RecurringPage() {
  const { t } = useTranslation()
  return <PlaceholderPage title={t('screens.recurring')} />
}
