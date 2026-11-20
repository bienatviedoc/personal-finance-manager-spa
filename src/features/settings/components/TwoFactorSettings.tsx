import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import type { ParseKeys } from 'i18next'
import { QRCodeSVG } from 'qrcode.react'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { TextField } from '@/shared/components/TextField'
import { Button } from '@/shared/ui/button'
import {
  twoFactorQuery,
  useNewRecoveryCodes,
  useSetUpTwoFactor,
  useTurnOffTwoFactor,
  useTurnOnTwoFactor,
  type TwoFactorSetup,
} from '../api/security'

/** What the user is in the middle of; nothing when the section just shows whether two-factor sign-in is on. */
type Doing = 'setting-up' | 'turning-off' | 'new-recovery-codes'

/** Two-factor sign-in with an authenticator app: turning it on and off, and the recovery codes. */
export function TwoFactorSettings() {
  const { t } = useTranslation()
  const headingId = useId()
  const twoFactor = useQuery(twoFactorQuery)
  const setUp = useSetUpTwoFactor()
  const turnOff = useTurnOffTwoFactor()
  const newCodes = useNewRecoveryCodes()
  const [doing, setDoing] = useState<Doing>()
  // Recovery codes just made: the only time they can be shown, so they stay until the user says they are saved.
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>()

  const startNewRecoveryCodes = () => setDoing('new-recovery-codes')
  const startTurningOff = () => setDoing('turning-off')
  const startSetUp = async () => {
    const outcome = await setUp.mutateAsync().catch(() => undefined)
    // Already on, turned on somewhere else: the section, loaded again, says so, and there is nothing to set up.
    if (!outcome || outcome.ready) setDoing('setting-up')
  }

  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <h3 id={headingId} className="font-semibold">
        {t('settings.security.twoFactor.title')}
      </h3>
      <p className="text-sm text-muted-foreground">{t('settings.security.twoFactor.intro')}</p>

      {twoFactor.isPending && <p className="text-sm text-muted-foreground">{t('settings.security.twoFactor.loading')}</p>}
      {twoFactor.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t('settings.security.failed')}
        </p>
      )}

      {twoFactor.data && (
        <>
          <p role="status" className="text-sm font-medium">
            {t(twoFactor.data.enabled ? 'settings.security.twoFactor.on' : 'settings.security.twoFactor.off')}
          </p>

          {recoveryCodes && <RecoveryCodes codes={recoveryCodes} onSaved={() => setRecoveryCodes(undefined)} />}

          {!twoFactor.data.enabled && doing !== 'setting-up' && (
            <Button type="button" disabled={setUp.isPending} onClick={() => void startSetUp()}>
              {t('settings.security.twoFactor.setUp')}
            </Button>
          )}
          {!twoFactor.data.enabled && doing === 'setting-up' && setUp.isError && (
            <p role="alert" className="text-sm text-destructive">
              {t('settings.security.failed')}
            </p>
          )}
          {!twoFactor.data.enabled && doing === 'setting-up' && setUp.data?.ready && (
            <SetUp
              setup={setUp.data.setup}
              onTurnedOn={(codes) => {
                setRecoveryCodes(codes)
                setDoing(undefined)
              }}
              onCancel={() => setDoing(undefined)}
            />
          )}

          {twoFactor.data.enabled && !recoveryCodes && (
            <p className="text-sm text-muted-foreground">
              {t('settings.security.twoFactor.recoveryCodesLeft', { count: twoFactor.data.recoveryCodesLeft })}
            </p>
          )}
          {twoFactor.data.enabled && !doing && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={startNewRecoveryCodes}>
                {t('settings.security.twoFactor.newRecoveryCodes')}
              </Button>
              <Button type="button" variant="outline" onClick={startTurningOff}>
                {t('settings.security.twoFactor.turnOff')}
              </Button>
            </div>
          )}
          {twoFactor.data.enabled && doing === 'new-recovery-codes' && (
            <ConfirmWithPassword
              explanation={t('settings.security.twoFactor.newRecoveryCodesBody')}
              submitLabel={t('settings.security.twoFactor.newRecoveryCodesSubmit')}
              confirm={async (password) => {
                const outcome = await newCodes.mutateAsync(password)
                if (outcome.saved) setRecoveryCodes(outcome.recoveryCodes)
                // Off, turned off somewhere else: the section, loaded again, says so, and there is nothing to confirm.
                return outcome.saved || !('fields' in outcome)
              }}
              onDone={() => setDoing(undefined)}
            />
          )}
          {twoFactor.data.enabled && doing === 'turning-off' && (
            <ConfirmWithPassword
              explanation={t('settings.security.twoFactor.turnOffBody')}
              submitLabel={t('settings.security.twoFactor.turnOffSubmit')}
              confirm={async (password) => {
                const outcome = await turnOff.mutateAsync(password)
                if (outcome.saved) setRecoveryCodes(undefined)
                return outcome.saved
              }}
              onDone={() => setDoing(undefined)}
            />
          )}
        </>
      )}
    </section>
  )
}

/** Authenticator apps show six digits, often in two groups. */
const codeSchema = z.object({
  code: z
    .string()
    .transform((typed) => typed.replace(/[\s-]/g, ''))
    .pipe(z.string().regex(/^\d{6}$/, { error: 'settings.security.twoFactor.errors.codeInvalid' })),
})

/** The QR code and key for the authenticator app, and the code that proves the app has them. */
function SetUp({ setup, onTurnedOn, onCancel }: { setup: TwoFactorSetup; onTurnedOn: (recoveryCodes: string[]) => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const turnOn = useTurnOnTwoFactor()
  const form = useForm({ resolver: zodResolver(codeSchema), defaultValues: { code: '' } })
  const { errors } = form.formState

  const onSubmit = form.handleSubmit(async ({ code }) => {
    const outcome = await turnOn.mutateAsync(code).catch(() => undefined)
    if (!outcome) return
    if (outcome.saved) onTurnedOn(outcome.recoveryCodes)
    else form.setError('code', { message: 'settings.security.twoFactor.errors.codeIncorrect' }, { shouldFocus: true })
  })

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-4 rounded-md border p-4">
      <ol className="list-decimal space-y-4 pl-5 text-sm">
        <li className="space-y-3">
          <p>{t('settings.security.twoFactor.scan')}</p>
          {/* Black on white whatever the theme: cameras read it best that way. */}
          <div className="inline-block rounded-md bg-white p-3">
            <QRCodeSVG value={setup.authenticatorUri} size={176} title={t('settings.security.twoFactor.qrCode')} role="img" />
          </div>
          <p>
            {t('settings.security.twoFactor.keyInstead')}
            {/* On its own line, so it wraps between groups and never inside one. */}
            <code data-testid="authenticator-key" className="mt-1 block font-mono font-medium">
              {inGroupsOfFour(setup.key)}
            </code>
          </p>
        </li>
        <li className="space-y-3">
          <p>{t('settings.security.twoFactor.confirm')}</p>
          <TextField
            label={t('settings.security.twoFactor.code')}
            inputMode="numeric"
            autoComplete="one-time-code"
            error={errors.code?.message && t(errors.code.message as ParseKeys)}
            {...form.register('code')}
          />
        </li>
      </ol>
      {turnOn.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t('settings.security.failed')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={turnOn.isPending}>
          {t('settings.security.twoFactor.turnOn')}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('settings.security.cancel')}
        </Button>
      </div>
    </form>
  )
}

function inGroupsOfFour(key: string) {
  return key.match(/.{1,4}/g)?.join(' ') ?? key
}

/** Recovery codes, shown the one time the API hands them over. */
function RecoveryCodes({ codes, onSaved }: { codes: string[]; onSaved: () => void }) {
  const { t } = useTranslation()
  const headingId = useId()
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(codes.join('\n'))
    setCopied(true)
  }

  return (
    <div className="space-y-3 rounded-md border p-4 text-sm">
      <h4 id={headingId} className="font-semibold">
        {t('settings.security.twoFactor.recoveryCodes')}
      </h4>
      <p>{t('settings.security.twoFactor.recoveryCodesBody')}</p>
      <ul aria-labelledby={headingId} className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => void copy()}>
          {t('settings.security.twoFactor.copyCodes')}
        </Button>
        <Button type="button" onClick={onSaved}>
          {t('settings.security.twoFactor.codesSaved')}
        </Button>
        {copied && <span role="status">{t('settings.security.twoFactor.copied')}</span>}
      </div>
    </div>
  )
}

const passwordSchema = z.object({
  password: z.string().min(1, { error: 'settings.security.twoFactor.errors.passwordRequired' }),
})

/** A change that a session left open must not be enough for: the user confirms it with their password. */
function ConfirmWithPassword({
  explanation,
  submitLabel,
  confirm,
  onDone,
}: {
  explanation: string
  submitLabel: string
  /** Answers whether the password was accepted; false shows it as not the user's. */
  confirm: (password: string) => Promise<boolean>
  onDone: () => void
}) {
  const { t } = useTranslation()
  const [failed, setFailed] = useState(false)
  const form = useForm({ resolver: zodResolver(passwordSchema), defaultValues: { password: '' } })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async ({ password }) => {
    setFailed(false)
    const accepted = await confirm(password).catch(() => undefined)
    if (accepted === undefined) setFailed(true)
    else if (accepted) onDone()
    else form.setError('password', { message: 'settings.security.twoFactor.errors.passwordIncorrect' }, { shouldFocus: true })
  })

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-4 rounded-md border p-4">
      <p className="text-sm">{explanation}</p>
      <TextField
        label={t('settings.security.twoFactor.password')}
        type="password"
        autoComplete="current-password"
        error={errors.password?.message && t(errors.password.message as ParseKeys)}
        {...form.register('password')}
      />
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t('settings.security.failed')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          {t('settings.security.cancel')}
        </Button>
      </div>
    </form>
  )
}
