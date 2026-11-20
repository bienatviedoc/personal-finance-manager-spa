import { zodResolver } from '@hookform/resolvers/zod'
import type { ParseKeys } from 'i18next'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { TextField } from '@/shared/components/TextField'
import { authenticatorCode } from '@/shared/lib/authenticatorCode'
import { Button } from '@/shared/ui/button'
import type { SignInOutcome } from '../api/signIn'
import { ErrorMessage } from '@/shared/components/ErrorMessage'

const authenticatorCodeForm = z.object({ code: authenticatorCode('auth.twoFactor.errors.codeInvalid') })
const recoveryCode = z.object({
  code: z
    .string()
    .trim()
    .min(1, { error: 'auth.twoFactor.errors.recoveryCodeRequired' }),
})

type Props = {
  /** Signs in with the email and password already entered, and this code. */
  onSubmit: (code: { twoFactorCode: string } | { recoveryCode: string }) => Promise<SignInOutcome>
  onStartOver: () => void
}

/**
 * The second step of signing in for a user with two-factor sign-in: the code their authenticator app shows, or
 * one of their recovery codes.
 */
export function TwoFactorStep({ onSubmit, onStartOver }: Props) {
  const { t } = useTranslation()
  const [withRecoveryCode, setWithRecoveryCode] = useState(false)

  return (
    <div className="space-y-4">
      {/* Keyed, so switching starts an empty form with its own rules. */}
      <CodeForm key={String(withRecoveryCode)} withRecoveryCode={withRecoveryCode} onSubmit={onSubmit} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="link" className="h-auto p-0" onClick={() => setWithRecoveryCode(!withRecoveryCode)}>
          {t(withRecoveryCode ? 'auth.twoFactor.useAuthenticator' : 'auth.twoFactor.useRecoveryCode')}
        </Button>
        <Button type="button" variant="link" className="h-auto p-0" onClick={onStartOver}>
          {t('auth.twoFactor.startOver')}
        </Button>
      </div>
    </div>
  )
}

function CodeForm({ withRecoveryCode, onSubmit }: { withRecoveryCode: boolean; onSubmit: Props['onSubmit'] }) {
  const { t } = useTranslation()
  const [outcome, setOutcome] = useState<SignInOutcome>()
  const form = useForm({ resolver: zodResolver(withRecoveryCode ? recoveryCode : authenticatorCodeForm), defaultValues: { code: '' } })
  const { errors } = form.formState

  // The step replaces the form the visitor was typing in, so typing carries on here.
  useEffect(() => form.setFocus('code'), [form])

  const submit = form.handleSubmit(async ({ code }) => {
    setOutcome(await onSubmit(withRecoveryCode ? { recoveryCode: code } : { twoFactorCode: code }).catch(() => undefined))
  })

  return (
    <form noValidate onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted-foreground">{t(withRecoveryCode ? 'auth.twoFactor.recoveryCodeBody' : 'auth.twoFactor.body')}</p>
      {outcome === 'two-factor-code-incorrect' && <ErrorMessage>{t(withRecoveryCode ? 'auth.twoFactor.errors.recoveryCodeIncorrect' : 'auth.twoFactor.errors.codeIncorrect')}</ErrorMessage>}
      {/* The same refusal as a wrong password: after too many wrong codes sign-in is paused, and the API does not say so. */}
      {outcome === 'wrong-credentials' && <ErrorMessage>{t('auth.twoFactor.errors.paused')}</ErrorMessage>}
      {withRecoveryCode ? (
        <TextField
          label={t('auth.twoFactor.recoveryCode')}
          autoComplete="off"
          spellCheck={false}
          error={errors.code?.message && t(errors.code.message as ParseKeys)}
          {...form.register('code')}
        />
      ) : (
        <TextField
          label={t('auth.twoFactor.code')}
          inputMode="numeric"
          autoComplete="one-time-code"
          error={errors.code?.message && t(errors.code.message as ParseKeys)}
          {...form.register('code')}
        />
      )}
      <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
        {t('auth.signIn.submit')}
      </Button>
    </form>
  )
}
