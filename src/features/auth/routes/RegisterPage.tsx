import { zodResolver } from '@hookform/resolvers/zod'
import type { ParseKeys } from 'i18next'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { z } from 'zod'
import { TextField } from '@/shared/components/TextField'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { Button } from '@/shared/ui/button'
import { useRegister } from '../api/register'
import { ErrorMessage } from '@/shared/components/ErrorMessage'

const schema = z.object({
  email: z.email({ error: 'auth.errors.emailInvalid' }),
  password: z.string().min(12, { error: 'auth.errors.passwordTooShort' }),
})

type Values = z.infer<typeof schema>

const serverErrors: Record<keyof Values, ParseKeys> = {
  email: 'auth.errors.emailInvalid',
  password: 'auth.errors.passwordTooShort',
}

export function RegisterPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('screens.register'))
  const navigate = useNavigate()
  const register = useRegister()
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } })
  const { errors } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    const outcome = await register.mutateAsync(values)
    if (outcome.saved) {
      await navigate(`/check-email?email=${encodeURIComponent(values.email)}`)
      return
    }
    for (const field of outcome.fields) form.setError(field, { message: serverErrors[field] }, { shouldFocus: true })
  })

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('screens.register')}</h1>

      {register.isError && <ErrorMessage>{t('auth.errors.generic')}</ErrorMessage>}

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
          autoComplete="new-password"
          hint={t('auth.register.passwordHint')}
          error={errors.password?.message && t(errors.password.message as ParseKeys)}
          {...form.register('password')}
        />
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {t('auth.register.submit')}
        </Button>
      </form>

      <p className="text-sm">
        {t('auth.register.alreadyRegistered')} <Link className="underline" to="/login">{t('auth.register.toSignIn')}</Link>
      </p>
    </section>
  )
}
