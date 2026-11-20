import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { ChangePasswordForm } from '../components/ChangePasswordForm'
import { TwoFactorSettings } from '../components/TwoFactorSettings'

/** How the user signs in: their password, and two-factor sign-in with an authenticator app. */
export function SecuritySettingsPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('settings.security.title'))

  return (
    <div className="max-w-md space-y-8">
      <h2 className="text-lg font-semibold">{t('settings.security.title')}</h2>
      <ChangePasswordForm />
      <TwoFactorSettings />
    </div>
  )
}
