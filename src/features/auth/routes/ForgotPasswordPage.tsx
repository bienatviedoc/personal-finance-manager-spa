import { zodResolver } from '@hookform/resolvers/zod'
import type { ParseKeys } from 'i18next'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { z } from 'zod'
import { TextField } from '@/shared/components/TextField'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { Button } from '@/shared/ui/button'
import { useRequestPasswordReset } from '../api/passwordReset'
import { ErrorMessage } from '@/shared/components/ErrorMessage'

const schema = z.object({
  email: z.email({ error: 'auth.errors.emailInvalid' }),
})

type Values = z.infer<typeof schema>

/**
 * Asks for a password reset link. The confirmation is the same whether or not the email has a user,
 * as the API's answer is.
 */
export function ForgotPasswordPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('screens.forgotPassword'))
  const requestReset = useRequestPasswordReset()
  const [sentTo, setSentTo] = useState<string>()
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '' } })
  const { errors } = form.formState

  const onSubmit = form.handleSubmit(async ({ email }) => {
    await requestReset.mutateAsync(email)
    setSentTo(email)
  })

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('screens.forgotPassword')}</h1>

      {sentTo ? (
        <p role="status">{t('auth.forgotPassword.sent', { email: sentTo })}</p>
      ) : (
        <>
          <p>{t('auth.forgotPassword.body')}</p>
          {requestReset.isError && <ErrorMessage>{t('auth.errors.generic')}</ErrorMessage>}
          <form noValidate onSubmit={onSubmit} className="space-y-4">
            <TextField
              label={t('auth.email')}
              type="email"
              autoComplete="email"
              error={errors.email?.message && t(errors.email.message as ParseKeys)}
              {...form.register('email')}
            />
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {t('auth.forgotPassword.submit')}
            </Button>
          </form>
        </>
      )}

      <p className="text-sm">
        <Link className="underline" to="/login">{t('auth.forgotPassword.toSignIn')}</Link>
      </p>
    </section>
  )
}
