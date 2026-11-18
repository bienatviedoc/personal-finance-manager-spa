import { zodResolver } from '@hookform/resolvers/zod'
import type { ParseKeys } from 'i18next'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { TextField } from '@/shared/components/TextField'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { Button } from '@/shared/ui/button'
import { type SignInOutcome, useSignIn } from '../api/signIn'
import { NotVerifiedNotice } from '../components/NotVerifiedNotice'
import { returnToFrom } from './returnTo'

const schema = z.object({
  email: z.email({ error: 'auth.errors.emailInvalid' }),
  password: z.string().min(1, { error: 'auth.errors.passwordRequired' }),
})

type Values = z.infer<typeof schema>

export function SignInPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('screens.signIn'))
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const signIn = useSignIn()
  const [outcome, setOutcome] = useState<{ result: SignInOutcome; email: string }>()
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } })
  const { errors } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await signIn.mutateAsync(values)
    if (result === 'signed-in') await navigate(returnToFrom(search), { replace: true })
    else setOutcome({ result, email: values.email })
  })

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('screens.signIn')}</h1>

      {outcome?.result === 'email-not-verified' && <NotVerifiedNotice email={outcome.email} />}
      {outcome?.result === 'wrong-credentials' && (
        <p role="alert" className="text-sm text-destructive">
          {t('auth.errors.wrongCredentials')}
        </p>
      )}
      {signIn.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t('auth.errors.generic')}
        </p>
      )}

      <form noValidate onSubmit={onSubmit} className="space-y-4">
        <TextField
          label={t('auth.email')}
          type="email"
          autoComplete="email"
          error={errors.email?.message && t(errors.email.message as ParseKeys)}
          {...form.register('email')}
        />
        <TextField
          label={t('auth.password')}
          type="password"
          autoComplete="current-password"
          error={errors.password?.message && t(errors.password.message as ParseKeys)}
          {...form.register('password')}
        />
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {t('auth.signIn.submit')}
        </Button>
      </form>

      <div className="space-y-1 text-sm">
        <p>
          {t('auth.signIn.newHere')} <Link className="underline" to="/register">{t('auth.signIn.toRegister')}</Link>
        </p>
        <p>
          <Link className="underline" to="/reset">{t('auth.signIn.forgotPassword')}</Link>
        </p>
      </div>
    </section>
  )
}
