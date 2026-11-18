import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { Button } from '@/shared/ui/button'
import { useResendVerification } from '../api/signIn'

/** After registering: the link is on its way. */
export function CheckEmailPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('screens.checkEmail'))
  const [search] = useSearchParams()
  const email = search.get('email') ?? ''
  const resend = useResendVerification()

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('screens.checkEmail')}</h1>
      <p>{t('auth.checkEmail.body', { email })}</p>
      {resend.isSuccess ? (
        <p role="status">{t('auth.checkEmail.resent', { email })}</p>
      ) : (
        <Button variant="outline" disabled={!email || resend.isPending} onClick={() => resend.mutate(email)}>
          {t('auth.checkEmail.resend')}
        </Button>
      )}
      {resend.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t('auth.errors.generic')}
        </p>
      )}
    </section>
  )
}
