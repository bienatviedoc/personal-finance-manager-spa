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
import { TwoFactorStep } from '../components/TwoFactorStep'
import { returnToFrom } from './returnTo'
import { ErrorMessage } from '@/shared/components/ErrorMessage'

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
  // Kept in memory only while the code is asked for: the API takes the email, password and code together.
  const [awaitingCode, setAwaitingCode] = useState<Values>()
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } })
  const { errors } = form.formState

  /** Signs in with what was entered; once signed in, goes on to where the visitor was heading. */
  const attempt = async (credentials: Parameters<typeof signIn.mutateAsync>[0]) => {
    const result = await signIn.mutateAsync(credentials)
    if (result === 'signed-in') await navigate(returnToFrom(search), { replace: true })
    return result
  }

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await attempt(values)
    if (result === 'two-factor-required') setAwaitingCode(values)
    else if (result !== 'signed-in') setOutcome({ result, email: values.email })
  })

  const tooManyAttempts = outcome?.result === 'too-many-attempts' || signIn.data === 'too-many-attempts'
  // What either step can run into: the rate limit, or a request that failed.
  const failures = (
    <>
      {tooManyAttempts && <ErrorMessage>{t('auth.errors.tooManyAttempts')}</ErrorMessage>}
      {signIn.isError && <ErrorMessage>{t('auth.errors.generic')}</ErrorMessage>}
    </>
  )

  if (awaitingCode) {
    return (
      <section className="space-y-6">
        <h1 className="text-2xl font-semibold">{t('screens.signIn')}</h1>
        {failures}
        <TwoFactorStep
          onSubmit={(code) => attempt({ ...awaitingCode, ...code })}
          onStartOver={() => {
            form.reset()
            signIn.reset()
            setOutcome(undefined)
            setAwaitingCode(undefined)
          }}
        />
      </section>
    )
  }

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('screens.signIn')}</h1>

      {outcome?.result === 'email-not-verified' && <NotVerifiedNotice email={outcome.email} />}
      {outcome?.result === 'wrong-credentials' && <ErrorMessage>{t('auth.errors.wrongCredentials')} {t('auth.errors.lockWarning')}</ErrorMessage>}
      {failures}

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
          <Link className="underline" to="/forgot-password">{t('auth.signIn.forgotPassword')}</Link>
        </p>
      </div>
    </section>
  )
}
