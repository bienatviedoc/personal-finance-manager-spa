import { zodResolver } from '@hookform/resolvers/zod'
import type { ParseKeys } from 'i18next'
import { useEffect, useId, useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { SelectField } from '@/shared/components/SelectField'
import { TextField } from '@/shared/components/TextField'
import { supportedLanguages } from '@/shared/i18n'
import { useLocale } from '@/shared/i18n/useLocale'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { currencies, formatMoney } from '@/shared/money'
import { Button } from '@/shared/ui/button'
import { useUpdateProfile, useUserSettings, type ProfileField } from '../api/profile'
import { FailureToast } from '@/shared/components/FailureToast'

const schema = z.object({
  baseCurrency: z.enum(currencies),
  timeZone: z.string().min(1),
  locale: z.enum(supportedLanguages),
  // As typed: a whole percentage from 1 to 100.
  budgetWarningPercent: z.string().regex(/^(100|[1-9][0-9]?)$/, { error: 'settings.profile.errors.budgetWarningPercent' }),
})

type Values = z.infer<typeof schema>

const serverErrors: Record<ProfileField, ParseKeys> = {
  baseCurrency: 'settings.profile.errors.baseCurrency',
  timeZone: 'settings.profile.errors.timeZone',
  locale: 'settings.profile.errors.locale',
  budgetWarningPercent: 'settings.profile.errors.budgetWarningPercent',
}

/** Shows off the base currency and language: large enough for groups, with decimals VND does not have. */
const exampleAmount = '1234567.89'

export function ProfileSettingsPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('settings.profile.title'))
  const headingId = useId()
  const formId = useId()
  const interfaceLocale = useLocale()
  const settings = useUserSettings()
  const update = useUpdateProfile()

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    // Follows the profile when it changes under the form, so saving never puts back what was there when the
    // screen opened. What the user has changed here and not yet saved is kept.
    values: {
      baseCurrency: settings.baseCurrency,
      timeZone: settings.timeZone,
      locale: settings.locale ?? interfaceLocale,
      budgetWarningPercent: String(settings.budgetWarningPercent),
    },
    resetOptions: { keepDirtyValues: true },
  })
  const { errors, isDirty } = form.formState

  // A locale picked in the sidebar is the user's latest choice: it replaces the one in the form, even one
  // they changed here and had not saved.
  const savedLocale = settings.locale
  useEffect(() => {
    if (savedLocale) form.resetField('locale', { defaultValue: savedLocale })
  }, [form, savedLocale])
  const [baseCurrency, locale, timeZone] = useWatch({ control: form.control, name: ['baseCurrency', 'locale', 'timeZone'] })

  const currencyNames = useMemo(() => new Intl.DisplayNames(interfaceLocale, { type: 'currency' }), [interfaceLocale])
  const timeZones = useMemo(() => {
    const zones = Intl.supportedValuesOf('timeZone')
    return zones.includes(timeZone) ? zones : [...zones, timeZone].sort()
  }, [timeZone])

  const onSubmit = form.handleSubmit(async ({ baseCurrency, budgetWarningPercent, ...values }) => {
    // A locked base currency is not sent: it cannot change, and the API refuses any other.
    const change = { ...values, budgetWarningPercent: Number(budgetWarningPercent), ...(settings.baseCurrencyLocked ? {} : { baseCurrency }) }
    const outcome = await update.mutateAsync(change).catch(() => undefined)
    if (!outcome) return
    if (outcome.saved) {
      // What was saved is no longer a change: the form goes back to following the profile.
      const { baseCurrency, timeZone, locale, budgetWarningPercent } = outcome.profile
      form.reset({ baseCurrency, timeZone, locale: locale ?? values.locale, budgetWarningPercent: String(budgetWarningPercent) })
      return
    }
    for (const field of outcome.fields) form.setError(field, { message: serverErrors[field] }, { shouldFocus: true })
  })
  // Said only while it is true: not once the user changes a field, or the profile changes elsewhere.
  const lastSaved = update.data?.saved ? update.data.profile : undefined
  const saved =
    !isDirty &&
    lastSaved !== undefined &&
    lastSaved.baseCurrency === settings.baseCurrency &&
    lastSaved.timeZone === settings.timeZone &&
    lastSaved.locale === settings.locale &&
    Number(lastSaved.budgetWarningPercent) === settings.budgetWarningPercent

  return (
    <form id={formId} noValidate aria-labelledby={headingId} onSubmit={onSubmit} className="max-w-md space-y-4">
      <h2 id={headingId} className="text-lg font-semibold">
        {t('settings.profile.title')}
      </h2>

      <SelectField
        label={t('settings.profile.baseCurrency')}
        hint={settings.baseCurrencyLocked ? t('settings.profile.baseCurrencyLocked') : t('settings.profile.baseCurrencyHint')}
        error={errors.baseCurrency?.message && t(errors.baseCurrency.message as ParseKeys)}
        options={currencies.map((code) => ({ value: code, label: `${currencyNames.of(code)} (${code})` }))}
        {...form.register('baseCurrency')}
        disabled={settings.baseCurrencyLocked}
      />
      <SelectField
        label={t('settings.profile.timeZone')}
        hint={t('settings.profile.timeZoneHint')}
        error={errors.timeZone?.message && t(errors.timeZone.message as ParseKeys)}
        options={timeZones.map((zone) => ({ value: zone, label: zone.replaceAll('_', ' ') }))}
        {...form.register('timeZone')}
      />
      <SelectField
        label={t('settings.profile.language')}
        error={errors.locale?.message && t(errors.locale.message as ParseKeys)}
        options={supportedLanguages.map((language) => ({ value: language, label: t(`language.${language}`) }))}
        {...form.register('locale')}
      />

      <TextField
        label={t('settings.profile.budgetWarning')}
        hint={t('settings.profile.budgetWarningHint')}
        error={errors.budgetWarningPercent?.message && t(errors.budgetWarningPercent.message as ParseKeys)}
        type="number"
        inputMode="numeric"
        min={1}
        max={100}
        step={1}
        {...form.register('budgetWarningPercent')}
      />

      <p className="text-sm text-muted-foreground">
        {t('settings.profile.amountExample')}{' '}
        <span data-testid="amount-example" className="font-medium text-foreground">
          {formatMoney(exampleAmount, baseCurrency, locale)}
        </span>
      </p>

      <FailureToast failed={update.isError} message={t('settings.profile.saveFailed')} retry={{ form: formId }} onDismiss={update.reset} />
      {saved && (
        <p role="status" className="text-sm">
          {t('settings.profile.saved')}
        </p>
      )}

      <Button type="submit" disabled={update.isPending}>
        {t('settings.profile.save')}
      </Button>
    </form>
  )
}
