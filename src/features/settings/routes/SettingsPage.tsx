import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { focusRing } from '@/shared/lib/utils'

/** The settings sections, each its own screen under /settings. */
export function SettingsPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('screens.settings'))

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('screens.settings')}</h1>
      <nav aria-label={t('settings.sections')}>
        <ul className="space-y-1">
          <li>
            <Link className={`underline ${focusRing}`} to="/settings/categories">
              {t('settings.categories')}
            </Link>
          </li>
        </ul>
      </nav>
    </section>
  )
}
