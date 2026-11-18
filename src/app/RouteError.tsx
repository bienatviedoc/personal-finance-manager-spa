import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { Button } from '@/shared/ui/button'
import { NotFoundPage } from './NotFoundPage'

/**
 * Shown in place of a screen that failed to render or load. Each screen has its own,
 * so a failure in one leaves the shell and every other screen usable.
 */
export function RouteError() {
  const error = useRouteError()

  // A screen reporting that what it was asked for does not exist is not a failure.
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />

  return <ScreenFailed error={error} />
}

function ScreenFailed({ error }: { error: unknown }) {
  const { t } = useTranslation()
  useDocumentTitle(t('errors.screenTitle'))

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
