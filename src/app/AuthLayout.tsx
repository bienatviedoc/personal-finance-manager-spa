import { useTranslation } from 'react-i18next'
import { Outlet } from 'react-router'
import { LanguageSwitch } from './LanguageSwitch'

/** Layout for the signed-out screens: no navigation, just the app name and language. */
export function AuthLayout() {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 text-foreground">
      <p className="font-semibold">{t('app.name')}</p>
      <main className="w-full max-w-sm">
        <Outlet />
      </main>
      <LanguageSwitch />
    </div>
  )
}
