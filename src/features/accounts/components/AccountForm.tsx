import { zodResolver } from '@hookform/resolvers/zod'
import type { ParseKeys } from 'i18next'
import { useId, useMemo } from 'react'
import { Controller, useForm, useWatch, type Control } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { useUserSettings } from '@/features/settings'
import { SelectField } from '@/shared/components/SelectField'
import { TextField } from '@/shared/components/TextField'
import { todayIn } from '@/shared/dates'
import { useLocale } from '@/shared/i18n/useLocale'
import { AmountInput, currencies, formatAmountForInput, type Currency } from '@/shared/money'
import { Button } from '@/shared/ui/button'
import { Label } from '@/shared/ui/label'
import {
  accountTypes,
  hasCreditCardFields,
  holdsAmountOwed,
  type Account,
  type AccountField,
  type AccountFields,
  type SaveOutcome,
} from '../api/accounts'
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
  // Empty, or exactly 4 digits: a full account or card number never leaves the form (spec ACC-8).
  last4: z
    .string()
    .trim()
    .regex(/^([0-9]{4})?$/, { error: 'accounts.errors.last4' }),
  // A credit card's only. Like the amount, but '' is "no credit limit".
  creditLimit: z
    .string({ error: 'accounts.errors.creditLimit' })
    .nullable()
    .refine((limit) => limit !== null, { error: 'accounts.errors.creditLimit' }),
  // '' is "not set", otherwise a day of the month.
  statementDay: z.string(),
  paymentDueDay: z.string(),
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
  last4: { field: 'last4', message: 'accounts.errors.last4' },
  creditLimit: { field: 'creditLimit', message: 'accounts.errors.creditLimit' },
  statementDay: { field: 'statementDay', message: 'accounts.errors.day' },
  paymentDueDay: { field: 'paymentDueDay', message: 'accounts.errors.day' },
}

// Named outside JSX, where lint would take a field name for user-facing text.
const amountField = 'amount'
const creditLimitField = 'creditLimit'

/** The days a month can have. In a shorter month, a later day means its last day. */
const daysOfMonth = Array.from({ length: 31 }, (_, index) => String(index + 1))

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
 * of an opening balance (spec section 3, rule 9); the API holds it as a negative balance. Any account can be
 * labelled with the last 4 digits of its number; a credit card is also asked for its credit limit, statement
 * day and payment due day, each optional.
 */
export function AccountForm({ account, institutions, onSave, onDone }: Props) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { baseCurrency, timeZone } = useUserSettings()
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
          last4: account.last4 ?? '',
          creditLimit: account.creditLimit ?? '',
          statementDay: String(account.statementDay ?? ''),
          paymentDueDay: String(account.paymentDueDay ?? ''),
        }
      : {
          name: '',
          type: 'current',
          institutionId: '',
          currency: baseCurrency,
          amount: '',
          openingDate: todayIn(timeZone),
          last4: '',
          creditLimit: '',
          statementDay: '',
          paymentDueDay: '',
        },
  })
  const { errors, isSubmitting } = form.formState
  const [type, currency] = useWatch({ control: form.control, name: ['type', 'currency'] })
  const owed = holdsAmountOwed(type)
  const creditCard = hasCreditCardFields(type)

  const currencyNames = useMemo(() => new Intl.DisplayNames(locale, { type: 'currency' }), [locale])
  const institutionOptions = institutions.filter((institution) => !institution.isArchived || institution.id === account?.institutionId)
  const dayOptions = [{ value: '', label: t('accounts.dayNotSet') }, ...daysOfMonth.map((day) => ({ value: day, label: day }))]
  const amountExample = { example: formatAmountForInput(exampleAmount, locale, currency) }

  const onSubmit = form.handleSubmit(async (values) => {
    const amount = values.amount as string
    const outcome = await onSave({
      name: values.name,
      type: values.type,
      institutionId: values.institutionId || null,
      currency: values.currency,
      openingDate: values.openingDate,
      ...(holdsAmountOwed(values.type) ? { amountOwed: amount } : { openingBalance: amount }),
      last4: values.last4 || null,
      // Fields the form no longer shows are not sent: only a credit card has them.
      ...(hasCreditCardFields(values.type) && {
        creditLimit: values.creditLimit || null,
        statementDay: values.statementDay ? Number(values.statementDay) : null,
        paymentDueDay: values.paymentDueDay ? Number(values.paymentDueDay) : null,
      }),
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

      <AmountField
        control={form.control}
        name={amountField}
        label={owed ? t('accounts.amountOwed') : t('accounts.openingBalance')}
        hint={owed ? t('accounts.amountOwedHint') : undefined}
        error={errors.amount?.message && t(errors.amount.message as ParseKeys, amountExample)}
        currency={currency}
      />

      <TextField
        type="date"
        label={t('accounts.openingDate')}
        error={errors.openingDate?.message && t(errors.openingDate.message as ParseKeys)}
        {...form.register('openingDate')}
      />
      <TextField
        label={t('accounts.last4')}
        hint={t('accounts.last4Hint')}
        inputMode="numeric"
        autoComplete="off"
        error={errors.last4?.message && t(errors.last4.message as ParseKeys)}
        {...form.register('last4')}
      />

      {creditCard && (
        <>
          <AmountField
            control={form.control}
            name={creditLimitField}
            label={t('accounts.creditLimit')}
            hint={t('accounts.creditLimitHint')}
            error={errors.creditLimit?.message && t(errors.creditLimit.message as ParseKeys, amountExample)}
            currency={currency}
          />
          <SelectField
            label={t('accounts.statementDay')}
            error={errors.statementDay?.message && t(errors.statementDay.message as ParseKeys)}
            options={dayOptions}
            {...form.register('statementDay')}
          />
          <SelectField
            label={t('accounts.paymentDueDay')}
            error={errors.paymentDueDay?.message && t(errors.paymentDueDay.message as ParseKeys)}
            options={dayOptions}
            {...form.register('paymentDueDay')}
          />
        </>
      )}

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

type AmountFieldProps = {
  control: Control<Values, unknown, z.output<typeof schema>>
  name: 'amount' | 'creditLimit'
  label: string
  hint?: string
  /** Already translated. */
  error?: string
  currency: Currency
}

/** A labelled amount input in the account's currency, whose hint and error are tied to it for screen readers. */
function AmountField({ control, name, label, hint, error, currency }: AmountFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <AmountInput
            id={id}
            ref={field.ref}
            name={field.name}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            currency={currency}
            aria-invalid={error ? true : undefined}
            aria-describedby={[hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined}
          />
        )}
      />
      {hint && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
