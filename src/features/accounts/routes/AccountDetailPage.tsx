import { useTranslation } from 'react-i18next'
import { PlaceholderPage } from '@/shared/components/PlaceholderPage'

export function AccountDetailPage() {
  const { t } = useTranslation()
  return <PlaceholderPage title={t('screens.accountDetail')} />
}
