import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router'
import { cn, focusRing } from '@/shared/lib/utils'

/** The settings screen: its sections, and the one open below them. */
export function SettingsPage() {
  const { t } = useTranslation()

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('screens.settings')}</h1>
      <nav aria-label={t('settings.sections')}>
        <ul className="flex gap-2 border-b">
          <li>
            <NavLink
              to="profile"
              className={({ isActive }) =>
                cn('-mb-px block border-b-2 border-transparent px-3 py-2 text-sm', focusRing, isActive && 'border-primary font-medium')
              }
            >
              {t('settings.profile.title')}
            </NavLink>
          </li>
        </ul>
      </nav>
      <Outlet />
    </section>
  )
}
