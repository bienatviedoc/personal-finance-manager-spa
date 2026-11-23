import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { deletionRequested } from '@/features/auth'
import { Button } from '@/shared/ui/button'
import { useDeleteUser } from '../api/data'
import { ConfirmWithPassword } from './ConfirmWithPassword'

/**
 * Deleting the user, which the interface calls deleting their profile and never their account (an account is
 * where money sits; see the glossary). Confirmed with the password; the sign-in screen then says how to cancel.
 */
export function DeleteUser() {
  const { t } = useTranslation()
  const headingId = useId()
  const navigate = useNavigate()
  const deleteUser = useDeleteUser()
  const [confirming, setConfirming] = useState(false)

  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <h3 id={headingId} className="font-semibold">
        {t('settings.data.delete.title')}
      </h3>
      <p className="text-sm text-muted-foreground">{t('settings.data.delete.body')}</p>
      {confirming ? (
        <ConfirmWithPassword
          destructive
          explanation={t('settings.data.delete.confirmBody')}
          submitLabel={t('settings.data.delete.submit')}
          confirm={async (password) => {
            const outcome = await deleteUser.mutateAsync(password)
            if (outcome.saved) await navigate('/login', { replace: true, state: deletionRequested })
            return outcome.saved
          }}
          onDone={() => setConfirming(false)}
        />
      ) : (
        <Button type="button" variant="destructive" onClick={() => setConfirming(true)}>
          {t('settings.data.delete.start')}
        </Button>
      )}
    </section>
  )
}
