import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Button } from '@/shared/ui/button'
import { signedInUserQuery } from '../api/session'
import { useSignOut } from '../api/signOut'

/** Who is signed in, and the way out. */
export function UserMenu() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: user } = useQuery(signedInUserQuery)
  const signOut = useSignOut()

  if (!user) return null

  return (
    <div className="space-y-2 text-sm">
      <p className="break-all text-muted-foreground">{t('auth.userMenu.signedInAs', { email: user.email })}</p>
      <Button
        variant="outline"
        size="sm"
        disabled={signOut.isPending}
        onClick={() => signOut.mutate(undefined, { onSuccess: () => void navigate('/login', { replace: true }) })}
      >
        {t('auth.userMenu.signOut')}
      </Button>
    </div>
  )
}
