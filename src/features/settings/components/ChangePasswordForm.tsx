import { zodResolver } from '@hookform/resolvers/zod'
import type { ParseKeys } from 'i18next'
import { useId } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { TextField } from '@/shared/components/TextField'
import { Button } from '@/shared/ui/button'
import { useChangePassword } from '../api/security'
import { ErrorMessage } from '@/shared/components/ErrorMessage'

const schema = z.object({
  currentPassword: z.string().min(1, { error: 'settings.security.password.errors.currentRequired' }),
  newPassword: z.string().min(12, { error: 'settings.security.password.errors.newTooShort' }),
})

type Values = z.infer<typeof schema>

const serverErrors: Record<keyof Values, ParseKeys> = {
  currentPassword: 'settings.security.password.errors.currentIncorrect',
  newPassword: 'settings.security.password.errors.newTooShort',
}

export function ChangePasswordForm() {
  const { t } = useTranslation()
  const headingId = useId()
  const change = useChangePassword()
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { currentPassword: '', newPassword: '' } })
  const { errors, isDirty } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    const outcome = await change.mutateAsync(values).catch(() => undefined)
    if (!outcome) return
    if (outcome.saved) form.reset()
    else for (const field of outcome.fields) form.setError(field, { message: serverErrors[field] }, { shouldFocus: true })
  })

  return (
    <form noValidate aria-labelledby={headingId} onSubmit={onSubmit} className="space-y-4">
      <h3 id={headingId} className="font-semibold">
        {t('settings.security.password.title')}
      </h3>
      <TextField
        label={t('settings.security.password.current')}
        type="password"
        autoComplete="current-password"
        error={errors.currentPassword?.message && t(errors.currentPassword.message as ParseKeys)}
        {...form.register('currentPassword')}
      />
      <TextField
        label={t('settings.security.password.new')}
        type="password"
        autoComplete="new-password"
        hint={t('settings.security.password.newHint')}
        error={errors.newPassword?.message && t(errors.newPassword.message as ParseKeys)}
        {...form.register('newPassword')}
      />
      {change.isError && <ErrorMessage>{t('settings.security.failed')}</ErrorMessage>}
      {/* Said until the user starts on another change. */}
      {change.data?.saved && !isDirty && (
        <p role="status" className="text-sm">
          {t('settings.security.password.changed')}
        </p>
      )}
      <Button type="submit" disabled={change.isPending}>
        {t('settings.security.password.submit')}
      </Button>
    </form>
  )
}
