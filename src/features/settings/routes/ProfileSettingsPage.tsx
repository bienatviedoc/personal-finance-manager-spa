import { zodResolver } from '@hookform/resolvers/zod'
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
import { useUpdateProfile, useUserSettings } from '../api/profile'

const schema = z.object({
  baseCurrency: z.enum(currencies),
  timeZone: z.string().min(1),
  locale: z.enum(supportedLanguages),
})

type Values = z.infer<typeof schema>

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
    defaultValues: { baseCurrency: settings.baseCurrency, timeZone: settings.timeZone, locale: settings.locale ?? interfaceLocale },
  })
  const [baseCurrency, locale, timeZone] = useWatch({ control: form.control, name: ['baseCurrency', 'locale', 'timeZone'] })

  const currencyNames = useMemo(() => new Intl.DisplayNames(interfaceLocale, { type: 'currency' }), [interfaceLocale])
  const timeZones = useMemo(() => {
    const zones = Intl.supportedValuesOf('timeZone')
    return zones.includes(timeZone) ? zones : [...zones, timeZone].sort()
  }, [timeZone])

  const onSubmit = form.handleSubmit((values) => update.mutate(values))

  return (
    <form noValidate aria-labelledby={headingId} onSubmit={onSubmit} className="max-w-md space-y-4">
      <h2 id={headingId} className="text-lg font-semibold">
        {t('settings.profile.title')}
      </h2>

      <SelectField
        label={t('settings.profile.baseCurrency')}
        hint={t('settings.profile.baseCurrencyHint')}
        options={currencies.map((code) => ({ value: code, label: `${currencyNames.of(code)} (${code})` }))}
        {...form.register('baseCurrency')}
      />
      <SelectField
        label={t('settings.profile.timeZone')}
        hint={t('settings.profile.timeZoneHint')}
        options={timeZones.map((zone) => ({ value: zone, label: zone.replaceAll('_', ' ') }))}
        {...form.register('timeZone')}
      />
      <SelectField
        label={t('settings.profile.language')}
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
      {update.isSuccess && (
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
