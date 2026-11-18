import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { Button } from '@/shared/ui/button'

export function NotFoundPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('errors.notFoundTitle'))

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('errors.notFoundTitle')}</h1>
      <p className="text-muted-foreground">{t('errors.notFoundBody')}</p>
      <Button asChild variant="outline">
        <Link to="/">{t('errors.toDashboard')}</Link>
      </Button>
    </section>
  )
}
