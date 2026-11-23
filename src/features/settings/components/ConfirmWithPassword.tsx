import { zodResolver } from '@hookform/resolvers/zod'
import type { ParseKeys } from 'i18next'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { FailureToast } from '@/shared/components/FailureToast'
import { TextField } from '@/shared/components/TextField'
import { Button } from '@/shared/ui/button'

const passwordSchema = z.object({
  password: z.string().min(1, { error: 'settings.confirmWithPassword.errors.required' }),
})

type Props = {
  /** Already translated: what the change will do. */
  explanation: string
  /** Already translated: the name of the button that makes the change. */
  submitLabel: string
  /** Whether the change destroys something, which its button then shows. */
  destructive?: boolean
  /** Answers whether the password was accepted; false shows it as not the user's. */
  confirm: (password: string) => Promise<boolean>
  onDone: () => void
}

/** A change that a session left open must not be enough for: the user confirms it with their password. */
export function ConfirmWithPassword({ explanation, submitLabel, destructive = false, confirm, onDone }: Props) {
  const { t } = useTranslation()
  const formId = useId()
  const [failed, setFailed] = useState(false)
  const form = useForm({ resolver: zodResolver(passwordSchema), defaultValues: { password: '' } })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async ({ password }) => {
    setFailed(false)
    const accepted = await confirm(password).catch(() => undefined)
    if (accepted === undefined) setFailed(true)
    else if (accepted) onDone()
    else form.setError('password', { message: 'settings.confirmWithPassword.errors.incorrect' }, { shouldFocus: true })
  })

  return (
    <form id={formId} noValidate onSubmit={onSubmit} className="space-y-4 rounded-md border p-4">
      <p className="text-sm">{explanation}</p>
      <TextField
        label={t('settings.confirmWithPassword.password')}
        type="password"
        autoComplete="current-password"
        error={errors.password?.message && t(errors.password.message as ParseKeys)}
        {...form.register('password')}
      />
      <FailureToast failed={failed} message={t('settings.security.failed')} retry={{ form: formId }} onDismiss={() => setFailed(false)} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={isSubmitting}>
          {submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          {t('settings.security.cancel')}
        </Button>
      </div>
    </form>
  )
}
