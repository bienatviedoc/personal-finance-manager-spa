import type { ParseKeys } from 'i18next'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router'
import { cn, focusRing } from '@/shared/lib/utils'

const sections: { to: string; label: ParseKeys }[] = [
  { to: 'profile', label: 'settings.profile.title' },
  { to: 'categories', label: 'settings.categories' },
  { to: 'rules', label: 'settings.rules' },
  { to: 'security', label: 'settings.security.title' },
  { to: 'data', label: 'settings.data.title' },
]

/** The settings screen: its sections, and the one open below them. */
export function SettingsPage() {
  const { t } = useTranslation()

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('screens.settings')}</h1>
      <nav aria-label={t('settings.sections')}>
        <ul className="flex flex-wrap gap-2 border-b">
          {sections.map(({ to, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  cn('-mb-px block border-b-2 border-transparent px-3 py-2 text-sm', focusRing, isActive && 'border-primary font-medium')
                }
              >
                {t(label)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </section>
  )
}
