import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { Button } from '@/shared/ui/button'
import { useVerifyEmail } from '../api/verifyEmail'

/** Where the link in the verification email lands. */
export function VerifyEmailPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('screens.verifyEmail'))
  const [search] = useSearchParams()
  const verification = useVerifyEmail(search.get('userId') ?? '', search.get('token') ?? '')
  const linkIsIncomplete = !search.get('userId') || !search.get('token')

  const confirmed = verification.data === true
  const failed = linkIsIncomplete || verification.isError || verification.data === false

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('screens.verifyEmail')}</h1>
      {!confirmed && !failed && <p role="status">{t('auth.verify.verifying')}</p>}
      {confirmed && <p role="status">{t('auth.verify.confirmedBody')}</p>}
      {failed && <p role="alert">{t('auth.verify.failedBody')}</p>}
      {(confirmed || failed) && (
        <Button asChild>
          <Link to="/login">{t('auth.verify.toSignIn')}</Link>
        </Button>
      )}
    </section>
  )
}
