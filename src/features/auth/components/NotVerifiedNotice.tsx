import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'
import { useResendVerification } from '../api/signIn'

/** Shown when the password was right but the email address is not confirmed yet. */
export function NotVerifiedNotice({ email }: { email: string }) {
  const { t } = useTranslation()
  const resend = useResendVerification()

  return (
    <div role="alert" className="space-y-3 rounded-md border p-4 text-sm">
      <p>{t('auth.notVerified.body')}</p>
      {resend.isSuccess ? (
        <p>{t('auth.notVerified.resent', { email })}</p>
      ) : (
        <Button variant="outline" disabled={resend.isPending} onClick={() => resend.mutate(email)}>
          {t('auth.notVerified.resend')}
        </Button>
      )}
      {resend.isError && <p className="text-destructive">{t('auth.errors.generic')}</p>}
    </div>
  )
}
