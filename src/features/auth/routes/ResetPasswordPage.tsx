import { zodResolver } from '@hookform/resolvers/zod'
import type { ParseKeys } from 'i18next'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { z } from 'zod'
import { TextField } from '@/shared/components/TextField'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { Button } from '@/shared/ui/button'
import { useResetPassword, type ResetPasswordOutcome } from '../api/passwordReset'

const schema = z.object({
  password: z.string().min(12, { error: 'auth.errors.passwordTooShort' }),
})

type Values = z.infer<typeof schema>

/** Where the link in the password reset email lands: the user sets a new password. */
export function ResetPasswordPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('screens.resetPassword'))
  const [search] = useSearchParams()
  const userId = search.get('userId') ?? ''
  const token = search.get('token') ?? ''
  const reset = useResetPassword()
  // A link missing its user id or token cannot work: say so before the user types a password.
  const [outcome, setOutcome] = useState<Exclude<ResetPasswordOutcome, 'password-refused'> | undefined>(userId && token ? undefined : 'link-invalid')
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: '' } })
  const { errors } = form.formState

  const onSubmit = form.handleSubmit(async ({ password }) => {
    const result = await reset.mutateAsync({ userId, token, password })
    if (result === 'password-refused') form.setError('password', { message: 'auth.errors.passwordTooShort' }, { shouldFocus: true })
    else setOutcome(result)
  })

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('screens.resetPassword')}</h1>

      {outcome === 'password-changed' && (
        <>
          <p role="status">{t('auth.resetPassword.changedBody')}</p>
          <Button asChild>
            <Link to="/login">{t('auth.resetPassword.toSignIn')}</Link>
          </Button>
        </>
      )}

      {outcome === 'link-invalid' && (
        <>
          <p role="alert">{t('auth.resetPassword.linkInvalidBody')}</p>
          <Button asChild>
            <Link to="/forgot-password">{t('auth.resetPassword.askAgain')}</Link>
          </Button>
        </>
      )}

      {!outcome && (
        <>
          {reset.isError && (
            <p role="alert" className="text-sm text-destructive">
              {t('auth.errors.generic')}
            </p>
          )}
          <form noValidate onSubmit={onSubmit} className="space-y-4">
            <TextField
              label={t('auth.resetPassword.newPassword')}
              type="password"
              autoComplete="new-password"
              hint={t('auth.register.passwordHint')}
              error={errors.password?.message && t(errors.password.message as ParseKeys)}
              {...form.register('password')}
            />
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {t('auth.resetPassword.submit')}
            </Button>
          </form>
        </>
      )}
    </section>
  )
}
