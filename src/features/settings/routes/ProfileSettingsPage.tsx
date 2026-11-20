import { zodResolver } from '@hookform/resolvers/zod'
import type { ParseKeys } from 'i18next'
import { useId, useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { SelectField } from '@/shared/components/SelectField'
import { supportedLanguages } from '@/shared/i18n'
import { useLocale } from '@/shared/i18n/useLocale'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { currencies, formatMoney } from '@/shared/money'
import { Button } from '@/shared/ui/button'
import { useUpdateProfile, useUserSettings, type ProfileField } from '../api/profile'

const schema = z.object({
  baseCurrency: z.enum(currencies),
  timeZone: z.string().min(1),
  locale: z.enum(supportedLanguages),
})

type Values = z.infer<typeof schema>

const serverErrors: Record<ProfileField, ParseKeys> = {
  baseCurrency: 'settings.profile.errors.baseCurrency',
  timeZone: 'settings.profile.errors.timeZone',
  locale: 'settings.profile.errors.locale',
}

/** Shows off the base currency and language: large enough for groups, with decimals VND does not have. */
const exampleAmount = '1234567.89'

export function ProfileSettingsPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('settings.profile.title'))
  const headingId = useId()
  const interfaceLocale = useLocale()
  const settings = useUserSettings()
  const update = useUpdateProfile()

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    // Follows the profile when it changes under the form (a locale picked in the sidebar, say), so saving
    // never puts back what was there when the screen opened. What the user has changed here is kept.
    values: { baseCurrency: settings.baseCurrency, timeZone: settings.timeZone, locale: settings.locale ?? interfaceLocale },
    resetOptions: { keepDirtyValues: true },
  })
  const { errors } = form.formState
  const [baseCurrency, locale, timeZone] = useWatch({ control: form.control, name: ['baseCurrency', 'locale', 'timeZone'] })

  const currencyNames = useMemo(() => new Intl.DisplayNames(interfaceLocale, { type: 'currency' }), [interfaceLocale])
  const timeZones = useMemo(() => {
    const zones = Intl.supportedValuesOf('timeZone')
    return zones.includes(timeZone) ? zones : [...zones, timeZone].sort()
  }, [timeZone])

  const onSubmit = form.handleSubmit(async (values) => {
    const outcome = await update.mutateAsync(values).catch(() => undefined)
    if (outcome?.saved === false) {
      for (const field of outcome.fields) form.setError(field, { message: serverErrors[field] }, { shouldFocus: true })
    }
  })
  const saved = update.data?.saved === true

  return (
    <form noValidate aria-labelledby={headingId} onSubmit={onSubmit} className="max-w-md space-y-4">
      <h2 id={headingId} className="text-lg font-semibold">
        {t('settings.profile.title')}
      </h2>

      <SelectField
        label={t('settings.profile.baseCurrency')}
        hint={t('settings.profile.baseCurrencyHint')}
        error={errors.baseCurrency?.message && t(errors.baseCurrency.message as ParseKeys)}
        options={currencies.map((code) => ({ value: code, label: `${currencyNames.of(code)} (${code})` }))}
        {...form.register('baseCurrency')}
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

      <p className="text-sm text-muted-foreground">
        {t('settings.profile.amountExample')}{' '}
        <span data-testid="amount-example" className="font-medium text-foreground">
          {formatMoney(exampleAmount, baseCurrency, locale)}
        </span>
      </p>

      {update.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t('settings.profile.saveFailed')}
        </p>
      )}
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
