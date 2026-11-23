import { zodResolver } from '@hookform/resolvers/zod'
import type { ParseKeys } from 'i18next'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import type { Account } from '@/features/accounts'
import { useCategoryChoices, type Category } from '@/features/categories'
import { useUserSettings } from '@/features/settings'
import { ComboboxField } from '@/shared/components/ComboboxField'
import { SelectField } from '@/shared/components/SelectField'
import { TextField } from '@/shared/components/TextField'
import { calendarDate, todayIn } from '@/shared/dates'
import { useLocale } from '@/shared/i18n/useLocale'
import { cn, focusRingWithin } from '@/shared/lib/utils'
import { AmountField, amountExample, formatAmountForInput, isZeroAmount, parseAmount, requiredAmount } from '@/shared/money'
import { Button } from '@/shared/ui/button'
import {
  recurringFrequencies,
  recurringRuleTypes,
  type RecurringRule,
  type RecurringRuleField,
  type RecurringRuleFields,
  type SaveOutcome,
} from '../api/recurringRules'

/** The longest an every N days rule waits between occurrences, as the API has it. */
const maxInterval = 365

/**
 * The API's rules (see `RecurringRule` and `RecurringSchedule` in the API), repeated here for fast feedback
 * only; the API enforces them again. What depends on the chosen account, the decimals its currency has, is
 * checked on submit.
 */
const schema = z
  .object({
    type: z.enum(recurringRuleTypes),
    accountId: z.string().min(1, { error: 'recurring.errors.account' }),
    // What the amount input holds: null when the text is not an amount, '' when it is empty.
    amount: requiredAmount({ invalid: 'recurring.errors.amountInvalid', required: 'recurring.errors.amountRequired' }).refine(
      (amount) => !amount || !isZeroAmount(amount),
      { error: 'recurring.errors.amountZero' },
    ),
    categoryId: z.string().min(1, { error: 'recurring.errors.category' }),
    frequency: z.enum(recurringFrequencies),
    /** As typed. Only an every N days rule has one. */
    interval: z.string().trim(),
    startDate: calendarDate('recurring.errors.startDate'),
    /** Empty for a rule that goes on. */
    endDate: calendarDate('recurring.errors.endDate').or(z.literal('')),
    payee: z.string().trim().max(200, { error: 'recurring.errors.payeeTooLong' }),
    note: z.string().trim().max(1000, { error: 'recurring.errors.noteTooLong' }),
  })
  .superRefine((values, context) => {
    if (values.frequency === 'everyNDays' && !(/^\d{1,3}$/.test(values.interval) && Number(values.interval) >= 1 && Number(values.interval) <= maxInterval)) {
      context.addIssue({ code: 'custom', path: ['interval'], message: 'recurring.errors.interval' })
    }
    // Calendar dates as YYYY-MM-DD sort as text.
    if (values.endDate !== '' && values.endDate < values.startDate) {
      context.addIssue({ code: 'custom', path: ['endDate'], message: 'recurring.errors.endBeforeStart' })
    }
  })

/** What the form holds; once validated, the amount is a decimal string. */
type Values = z.input<typeof schema>

/** The message the form shows for each field the API refused. */
const serverErrors: Record<RecurringRuleField, ParseKeys> = {
  type: 'recurring.errors.type',
  accountId: 'recurring.errors.account',
  amount: 'recurring.errors.amountInvalid',
  categoryId: 'recurring.errors.category',
  payee: 'recurring.errors.payeeTooLong',
  note: 'recurring.errors.noteTooLong',
  frequency: 'recurring.errors.frequency',
  interval: 'recurring.errors.interval',
  startDate: 'recurring.errors.startDate',
  endDate: 'recurring.errors.endBeforeStart',
}

// Named outside JSX, where lint would take a field name for user-facing text.
const amountField = 'amount'
const categoryField = 'categoryId'

type Props = {
  /** The form's id, for a button outside it that submits it: the one that tries again after a failure. */
  id?: string
  /** The rule being edited; none when setting one up. */
  rule?: RecurringRule
  /** Every account of the user's. Archived ones are offered only to the rule already on them. */
  accounts: Account[]
  /** The user's category tree, archived categories included; those are offered only to the rule that has them. */
  categories: Category[]
  onSave: (fields: RecurringRuleFields) => Promise<SaveOutcome>
  onSaved: () => void
  onCancel: () => void
}

/**
 * Sets up or edits a recurring rule: income or an expense that repeats. The type toggle at the top decides
 * which categories are offered; the chosen account decides the currency of the amount.
 */
export function RecurringRuleForm({ id, rule, accounts, categories, onSave, onSaved, onCancel }: Props) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { baseCurrency, timeZone } = useUserSettings()
  const today = todayIn(timeZone)

  const accountOptions = accounts.filter((account) => !account.isArchived || account.id === rule?.accountId)
  const form = useForm<Values, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: rule
      ? {
          // A rule is only ever income or an expense.
          type: rule.type === 'income' ? 'income' : 'expense',
          accountId: rule.accountId,
          amount: rule.amount,
          categoryId: rule.categoryId,
          frequency: rule.frequency,
          interval: String(rule.interval ?? ''),
          startDate: rule.startDate,
          endDate: rule.endDate ?? '',
          payee: rule.payee ?? '',
          note: rule.note ?? '',
        }
      : {
          type: 'expense',
          accountId: accountOptions[0]?.id ?? '',
          amount: '',
          categoryId: '',
          frequency: 'monthly',
          interval: '',
          startDate: today,
          endDate: '',
          payee: '',
          note: '',
        },
  })
  const { errors, isSubmitting } = form.formState
  const [type, accountId, frequency, startDate] = useWatch({ control: form.control, name: ['type', 'accountId', 'frequency', 'startDate'] })
  const currency = accounts.find((account) => account.id === accountId)?.currency ?? baseCurrency

  const categoryOptions = useCategoryChoices(categories)
    .filter(({ category }) => category.kind === type && (!category.isArchived || category.id === rule?.categoryId))
    .map(({ category, label }) => ({ value: category.id, label }))

  const typeToggle = form.register('type', {
    // A category of the other kind cannot stay: the type decides which kind it takes.
    onChange: () => form.setValue('categoryId', ''),
  })

  const onSubmit = form.handleSubmit(async (values) => {
    const amount = values.amount as string
    const account = accounts.find((candidate) => candidate.id === values.accountId)
    // Typed for another account's currency, then moved to one with fewer decimals.
    if (!account || parseAmount(formatAmountForInput(amount, locale, account.currency), locale, account.currency) === null) {
      form.setError(account ? 'amount' : 'accountId', { message: account ? 'recurring.errors.amountInvalid' : 'recurring.errors.account' }, { shouldFocus: true })
      return
    }

    let outcome: SaveOutcome
    try {
      outcome = await onSave({
        type: values.type,
        accountId: values.accountId,
        amount,
        categoryId: values.categoryId,
        frequency: values.frequency,
        interval: values.frequency === 'everyNDays' ? Number(values.interval) : null,
        startDate: values.startDate,
        endDate: values.endDate || null,
        payee: values.payee || null,
        note: values.note || null,
      })
    } catch {
      // Whoever saves says that it failed; the form keeps what was entered, to be saved again.
      return
    }
    if (outcome.saved) {
      onSaved()
      return
    }
    for (const refused of outcome.fields) {
      form.setError(refused, { message: serverErrors[refused] }, { shouldFocus: true })
    }
  })

  return (
    <form id={id} noValidate onSubmit={onSubmit} className="space-y-4">
      <fieldset>
        <legend className="sr-only">{t('recurring.type')}</legend>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {recurringRuleTypes.map((value) => (
            <label
              key={value}
              className={cn(
                'cursor-pointer rounded-md px-3 py-1.5 text-center text-sm font-medium text-muted-foreground has-checked:bg-background has-checked:text-foreground has-checked:shadow-sm',
                focusRingWithin,
              )}
            >
              <input type="radio" value={value} className="sr-only" {...typeToggle} />
              {t(`recurring.types.${value}`)}
            </label>
          ))}
        </div>
        {errors.type?.message && <p className="text-sm text-destructive">{t(errors.type.message as ParseKeys)}</p>}
      </fieldset>

      <SelectField
        label={t('recurring.account')}
        error={errors.accountId?.message && t(errors.accountId.message as ParseKeys)}
        options={accountOptions.map((account) => ({ value: account.id, label: t('recurring.accountOption', { name: account.name, currency: account.currency }) }))}
        {...form.register('accountId')}
      />
      <AmountField
        control={form.control}
        name={amountField}
        label={t('recurring.amountIn', { currency })}
        error={errors.amount?.message && t(errors.amount.message as ParseKeys, { example: amountExample(locale, currency) })}
        currency={currency}
      />
      {/* A type-ahead picker, as every form that takes a category has. */}
      <Controller
        control={form.control}
        name={categoryField}
        render={({ field }) => (
          <ComboboxField
            label={t('recurring.category')}
            placeholder={t('recurring.chooseCategory')}
            noMatches={t('recurring.noCategoryMatches')}
            error={errors.categoryId?.message && t(errors.categoryId.message as ParseKeys)}
            options={categoryOptions}
            ref={field.ref}
            value={field.value}
            onBlur={field.onBlur}
            onChange={field.onChange}
          />
        )}
      />

      <SelectField
        label={t('recurring.frequency')}
        error={errors.frequency?.message && t(errors.frequency.message as ParseKeys)}
        options={recurringFrequencies.map((value) => ({ value, label: t(`recurring.frequencyOptions.${value}`) }))}
        {...form.register('frequency')}
      />
      {frequency === 'everyNDays' && (
        <TextField
          inputMode="numeric"
          autoComplete="off"
          label={t('recurring.interval')}
          error={errors.interval?.message && t(errors.interval.message as ParseKeys)}
          {...form.register('interval')}
        />
      )}
      {frequency === 'monthly' && <p className="text-sm text-muted-foreground">{t('recurring.monthEndHint')}</p>}
      <TextField
        type="date"
        label={t('recurring.startDate')}
        // Setting up a rule that started a while ago records what was due since: say so before it happens.
        hint={!rule && startDate !== '' && startDate < today ? t('recurring.startInPastHint') : undefined}
        error={errors.startDate?.message && t(errors.startDate.message as ParseKeys)}
        {...form.register('startDate')}
      />
      <TextField
        type="date"
        label={t('recurring.endDate')}
        error={errors.endDate?.message && t(errors.endDate.message as ParseKeys)}
        {...form.register('endDate')}
      />

      <TextField
        label={t('recurring.payee')}
        autoComplete="off"
        error={errors.payee?.message && t(errors.payee.message as ParseKeys)}
        {...form.register('payee')}
      />
      <TextField
        label={t('recurring.note')}
        autoComplete="off"
        error={errors.note?.message && t(errors.note.message as ParseKeys)}
        {...form.register('note')}
      />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {t('recurring.save')}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('recurring.cancel')}
        </Button>
      </div>
    </form>
  )
}
