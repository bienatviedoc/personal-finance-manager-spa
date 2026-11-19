import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router'
import { UserMenu } from '@/features/auth'
import { useProfileLanguage, useSaveLanguage } from '@/features/settings'
import { cn, focusRing } from '@/shared/lib/utils'
import { LanguageSwitch } from './LanguageSwitch'
import { navigation } from './navigation'

export function AppShell() {
  const { t } = useTranslation()
  useProfileLanguage()
  const saveLanguage = useSaveLanguage()

  return (
    <div className="flex min-h-svh bg-background text-foreground">
      <aside className="flex w-60 shrink-0 flex-col gap-6 border-r bg-sidebar p-4 text-sidebar-foreground">
        <p className="px-2 font-semibold">{t('app.name')}</p>
        <nav aria-label={t('nav.label')}>
          <ul className="space-y-1">
            {navigation.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'block rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent',
                      focusRing,
                      isActive && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
                    )
                  }
                >
                  {t(item.label)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-auto space-y-4 px-2">
          <UserMenu />
          <LanguageSwitch onChoose={saveLanguage} />
        </div>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  )
}
