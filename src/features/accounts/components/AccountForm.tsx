import { zodResolver } from '@hookform/resolvers/zod'
import type { ParseKeys } from 'i18next'
import { useId, useMemo } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { useUserSettings } from '@/features/settings'
import { SelectField } from '@/shared/components/SelectField'
import { TextField } from '@/shared/components/TextField'
import { todayIn } from '@/shared/dates'
import { useLocale } from '@/shared/i18n/useLocale'
import { AmountInput, currencies, formatAmountForInput } from '@/shared/money'
import { Button } from '@/shared/ui/button'
import { Label } from '@/shared/ui/label'
import { accountTypes, holdsAmountOwed, type Account, type AccountField, type AccountFields, type SaveOutcome } from '../api/accounts'
import type { Institution } from '../api/institutions'

const schema = z.object({
  name: z.string().trim().min(1, { error: 'accounts.errors.nameRequired' }).max(100, { error: 'accounts.errors.nameTooLong' }),
  type: z.enum(accountTypes),
  // '' is "no institution".
  institutionId: z.string(),
  currency: z.enum(currencies),
  // What the amount input holds: null when the text is not an amount, '' when it is empty.
  amount: z
    .string({ error: 'accounts.errors.amountInvalid' })
    .nullable()
    .refine((amount) => amount !== null, { error: 'accounts.errors.amountInvalid' })
    .refine((amount) => amount !== '', { error: 'accounts.errors.amountRequired' }),
  openingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'accounts.errors.openingDate' }),
})

/** What the form holds; once validated, the amount is a decimal string. */
type Values = z.input<typeof schema>

/** Where the form shows what the API refused: both amounts are the one amount field. */
const serverErrors: Record<AccountField, { field: keyof Values; message: ParseKeys }> = {
  name: { field: 'name', message: 'accounts.errors.nameTooLong' },
  type: { field: 'type', message: 'accounts.errors.type' },
  institutionId: { field: 'institutionId', message: 'accounts.errors.institution' },
  currency: { field: 'currency', message: 'accounts.errors.currencyLocked' },
  openingBalance: { field: 'amount', message: 'accounts.errors.amountInvalid' },
  amountOwed: { field: 'amount', message: 'accounts.errors.amountInvalid' },
  openingDate: { field: 'openingDate', message: 'accounts.errors.openingDate' },
}

// Named outside JSX, where lint would take a field name for user-facing text.
const amountField = 'amount'

/** An amount large enough to show the locale's separators, for the hint in an error. */
const exampleAmount = '1250000'

type Props = {
  /** The account being edited; none when adding one. */
  account?: Account
  /** Every institution of the user's. Archived ones are offered only to the account already with them. */
  institutions: Institution[]
  onSave: (fields: AccountFields) => Promise<SaveOutcome>
  onDone: () => void
}

/**
 * Adds or edits an account. A credit card or loan is asked for the amount owed, as a positive number, instead
 * of an opening balance (spec section 3, rule 9); the API holds it as a negative balance.
 */
export function AccountForm({ account, institutions, onSave, onDone }: Props) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { baseCurrency, timeZone } = useUserSettings()
  const amountId = useId()
  const form = useForm<Values, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: account
      ? {
          name: account.name,
          type: account.type,
          institutionId: account.institutionId ?? '',
          currency: account.currency,
          amount: account.amountOwed ?? account.openingBalance,
          openingDate: account.openingDate,
        }
      : { name: '', type: 'current', institutionId: '', currency: baseCurrency, amount: '', openingDate: todayIn(timeZone) },
  })
  const { errors, isSubmitting } = form.formState
  const [type, currency] = useWatch({ control: form.control, name: ['type', 'currency'] })
  const owed = holdsAmountOwed(type)

  const currencyNames = useMemo(() => new Intl.DisplayNames(locale, { type: 'currency' }), [locale])
  const institutionOptions = institutions.filter((institution) => !institution.isArchived || institution.id === account?.institutionId)
  const amountHintId = `${amountId}-hint`
  const amountErrorId = `${amountId}-error`

  const onSubmit = form.handleSubmit(async (values) => {
    const amount = values.amount as string
    const outcome = await onSave({
      name: values.name,
      type: values.type,
      institutionId: values.institutionId || null,
      currency: values.currency,
      openingDate: values.openingDate,
      ...(holdsAmountOwed(values.type) ? { amountOwed: amount } : { openingBalance: amount }),
    })
    if (outcome.saved) {
      onDone()
      return
    }
    if ('stale' in outcome) return
    for (const refused of outcome.fields) {
      const { field, message } = serverErrors[refused]
      form.setError(field, { message }, { shouldFocus: true })
    }
  })

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-4 rounded-lg border p-4">
      <TextField
        label={t('accounts.name')}
        autoComplete="off"
        error={errors.name?.message && t(errors.name.message as ParseKeys)}
        {...form.register('name')}
      />
      <SelectField
        label={t('accounts.type')}
        error={errors.type?.message && t(errors.type.message as ParseKeys)}
        options={accountTypes.map((value) => ({ value, label: t(`accounts.types.${value}`) }))}
        {...form.register('type')}
      />
      <SelectField
        label={t('accounts.institution')}
        error={errors.institutionId?.message && t(errors.institutionId.message as ParseKeys)}
        options={[
          { value: '', label: t('accounts.noInstitution') },
          ...institutionOptions.map((institution) => ({ value: institution.id, label: institution.name })),
        ]}
        {...form.register('institutionId')}
      />
      <SelectField
        label={t('accounts.currency')}
        error={errors.currency?.message && t(errors.currency.message as ParseKeys)}
        options={currencies.map((code) => ({ value: code, label: `${currencyNames.of(code)} (${code})` }))}
        {...form.register('currency')}
      />

      <div className="space-y-1.5">
        <Label htmlFor={amountId}>{owed ? t('accounts.amountOwed') : t('accounts.openingBalance')}</Label>
        <Controller
          control={form.control}
          name={amountField}
          render={({ field }) => (
            <AmountInput
              id={amountId}
              ref={field.ref}
              name={field.name}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              currency={currency}
              aria-invalid={errors.amount ? true : undefined}
              aria-describedby={[owed && amountHintId, errors.amount && amountErrorId].filter(Boolean).join(' ') || undefined}
            />
          )}
        />
        {owed && (
          <p id={amountHintId} className="text-sm text-muted-foreground">
            {t('accounts.amountOwedHint')}
          </p>
        )}
        {errors.amount?.message && (
          <p id={amountErrorId} className="text-sm text-destructive">
            {t(errors.amount.message as ParseKeys, { example: formatAmountForInput(exampleAmount, locale, currency) })}
          </p>
        )}
      </div>

      <TextField
        type="date"
        label={t('accounts.openingDate')}
        error={errors.openingDate?.message && t(errors.openingDate.message as ParseKeys)}
        {...form.register('openingDate')}
      />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {t('accounts.save')}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          {t('accounts.cancel')}
        </Button>
      </div>
    </form>
  )
}
