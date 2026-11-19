import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'

export function AccountsPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('screens.accounts'))

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t('screens.accounts')}</h1>
        <Link className="text-sm underline" to="/accounts/institutions">
          {t('screens.institutions')}
        </Link>
      </div>
      <p className="text-muted-foreground">{t('placeholder.notBuilt')}</p>
    </section>
  )
}
