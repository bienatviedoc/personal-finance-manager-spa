import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useRouteError } from 'react-router'
import { Button } from '@/shared/ui/button'

/**
 * Shown in place of a screen that failed to render or load. Each screen has its own,
 * so a failure in one leaves the shell and every other screen usable.
 */
export function RouteError() {
  const { t } = useTranslation()
  const error = useRouteError()

  useEffect(() => {
    // Error tracking hooks in here (see the observability ticket); details never reach the page.
    console.error(error)
  }, [error])

  return (
    <section role="alert" className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('errors.screenTitle')}</h1>
      <p className="text-muted-foreground">{t('errors.screenBody')}</p>
      <div className="flex gap-2">
        <Button onClick={() => window.location.reload()}>{t('errors.reload')}</Button>
        <Button asChild variant="outline">
          <Link to="/">{t('errors.toDashboard')}</Link>
        </Button>
      </div>
    </section>
  )
}
