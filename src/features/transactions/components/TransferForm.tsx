import { zodResolver } from '@hookform/resolvers/zod'
import type { ParseKeys } from 'i18next'
import { useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { currencyOf, findAccount, useAccountChoices, type Account } from '@/features/accounts'
import { useUserSettings } from '@/features/settings'
import { isStale } from '@/shared/api/versionedSave'
import { SelectField } from '@/shared/components/SelectField'
import { TextField } from '@/shared/components/TextField'
import { calendarDate, todayIn, type CalendarDate } from '@/shared/dates'
import { useLocale } from '@/shared/i18n/useLocale'
import { AmountField, amountExample, fitsCurrency, isZeroAmount, requiredAmount, typedAmount } from '@/shared/money'
import { Button } from '@/shared/ui/button'
import type { Transfer, TransferField, TransferFields, TransferSaveOutcome } from '../api/transfers'

/**
 * The API's rules (see `Transfer` in the API), repeated here for fast feedback only; the API enforces them
 * again. What depends on the two chosen accounts, whether the amount that arrives is needed and the decimals
 * each currency has, is checked on submit.
 */
const schemaFor = (today: CalendarDate) =>
  z
    .object({
      fromAccountId: z.string().min(1, { error: 'transfers.errors.account' }),
      toAccountId: z.string().min(1, { error: 'transfers.errors.account' }),
      // What an amount input holds: null when the text is not an amount, '' when it is empty.
      amount: requiredAmount({ invalid: 'transfers.errors.amountInvalid', required: 'transfers.errors.amountRequired' }).refine(
        (amount) => !amount || !isZeroAmount(amount),
        { error: 'transfers.errors.amountZero' },
      ),
      // Only asked for between accounts in different currencies, so it may be empty here.
      toAmount: typedAmount('transfers.errors.amountInvalid').refine((amount) => !amount || !isZeroAmount(amount), { error: 'transfers.errors.amountZero' }),
      // Calendar dates as YYYY-MM-DD sort as text.
      date: calendarDate('transfers.errors.date').refine((date) => date <= today, { error: 'transfers.errors.dateInFuture' }),
      note: z.string().trim().max(1000, { error: 'transfers.errors.noteTooLong' }),
    })
    .refine((transfer) => transfer.fromAccountId !== transfer.toAccountId, { path: ['toAccountId'], error: 'transfers.errors.sameAccount' })

type Schema = ReturnType<typeof schemaFor>
/** What the form holds; once validated, each amount is a decimal string. */
type Values = z.input<Schema>

/** The message the form shows for each field the API refused. */
const serverErrors: Record<TransferField, ParseKeys> = {
  fromAccountId: 'transfers.errors.account',
  toAccountId: 'transfers.errors.account',
  amount: 'transfers.errors.amountInvalid',
  toAmount: 'transfers.errors.amountInvalid',
  date: 'transfers.errors.dateInFuture',
  note: 'transfers.errors.noteTooLong',
}

// Named outside JSX, where lint would take a field name for user-facing text.
const amountField = 'amount'
const toAmountField = 'toAmount'

type Props = {
  /** The form's id, for a button outside it that submits it: the one that tries again after a failure. */
  id?: string
  /** The transfer being edited; none when recording one. */
  transfer?: Transfer
  /** Every account of the user's. Archived ones are offered only to the transfer already on them. */
  accounts: Account[]
  onSave: (fields: TransferFields) => Promise<TransferSaveOutcome>
  onSaved: () => void
  onCancel: () => void
}

/**
 * Records or edits a transfer between two of the user's accounts. Between accounts in one currency there is
 * one amount; between currencies the user enters what left and what arrived, and no exchange rate is looked
 * up (spec section 3, rule 4).
 */
export function TransferForm({ id, transfer, accounts, onSave, onSaved, onCancel }: Props) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { baseCurrency, timeZone } = useUserSettings()
  const today = todayIn(timeZone)
  const schema = useMemo(() => schemaFor(today), [today])

  const offered = accounts.filter((account) => !account.isArchived || account.id === transfer?.fromAccountId || account.id === transfer?.toAccountId)
  const accountOptions = useAccountChoices(offered)
  const form = useForm<Values, unknown, z.output<Schema>>({
    resolver: zodResolver(schema),
    defaultValues: transfer
      ? {
          fromAccountId: transfer.fromAccountId,
          toAccountId: transfer.toAccountId,
          amount: transfer.amount,
          // Kept even between accounts in one currency, where it is not shown: it is there if an account in another currency is chosen.
          toAmount: transfer.currency === transfer.toCurrency ? '' : transfer.toAmount,
          date: transfer.date,
          note: transfer.note ?? '',
        }
      : { fromAccountId: offered[0]?.id ?? '', toAccountId: offered[1]?.id ?? '', amount: '', toAmount: '', date: today, note: '' },
  })
  const { errors, isSubmitting } = form.formState
  const [fromAccountId, toAccountId] = useWatch({ control: form.control, name: ['fromAccountId', 'toAccountId'] })
  const [currency, toCurrency] = [currencyOf(accounts, fromAccountId, baseCurrency), currencyOf(accounts, toAccountId, baseCurrency)]
  const betweenCurrencies = currency !== toCurrency

  const onSubmit = form.handleSubmit(async (values) => {
    const amount = values.amount as string
    const from = findAccount(accounts, values.fromAccountId)
    const to = findAccount(accounts, values.toAccountId)
    if (!from || !to) {
      form.setError(from ? 'toAccountId' : 'fromAccountId', { message: 'transfers.errors.account' }, { shouldFocus: true })
      return
    }
    if (!fitsCurrency(amount, from.currency, locale)) {
      form.setError('amount', { message: 'transfers.errors.amountInvalid' }, { shouldFocus: true })
      return
    }
    // Between accounts in one currency one amount moves, whatever was typed for another currency before.
    const toAmount = from.currency === to.currency ? null : values.toAmount
    if (from.currency !== to.currency && (!toAmount || !fitsCurrency(toAmount, to.currency, locale))) {
      form.setError('toAmount', { message: toAmount ? 'transfers.errors.amountInvalid' : 'transfers.errors.toAmountRequired' }, { shouldFocus: true })
      return
    }

    let outcome: TransferSaveOutcome
    try {
      outcome = await onSave({ fromAccountId: from.id, toAccountId: to.id, amount, toAmount, date: values.date, note: values.note || null })
    } catch {
      // Whoever saves says that it failed; the form keeps what was entered, to be saved again.
      return
    }
    if (outcome.saved) {
      onSaved()
      return
    }
    if (isStale(outcome)) return
    for (const refused of outcome.fields) {
      form.setError(refused, { message: serverErrors[refused] }, { shouldFocus: true })
    }
  })

  return (
    <form id={id} noValidate onSubmit={onSubmit} className="space-y-4">
      <SelectField
        label={t('transfers.from')}
        error={errors.fromAccountId?.message && t(errors.fromAccountId.message as ParseKeys)}
        options={accountOptions}
        {...form.register('fromAccountId')}
      />
      <SelectField
        label={t('transfers.to')}
        error={errors.toAccountId?.message && t(errors.toAccountId.message as ParseKeys)}
        options={accountOptions}
        {...form.register('toAccountId')}
      />

      <AmountField
        control={form.control}
        name={amountField}
        label={t('transfers.amountIn', { currency })}
        error={errors.amount?.message && t(errors.amount.message as ParseKeys, { example: amountExample(locale, currency) })}
        currency={currency}
      />
      {betweenCurrencies && (
        <AmountField
          control={form.control}
          name={toAmountField}
          label={t('transfers.toAmountIn', { currency: toCurrency })}
          hint={t('transfers.bothAmounts')}
          error={errors.toAmount?.message && t(errors.toAmount.message as ParseKeys, { example: amountExample(locale, toCurrency) })}
          currency={toCurrency}
        />
      )}

      <TextField
        type="date"
        max={today}
        label={t('transfers.date')}
        error={errors.date?.message && t(errors.date.message as ParseKeys)}
        {...form.register('date')}
      />
      <TextField
        label={t('transfers.note')}
        autoComplete="off"
        error={errors.note?.message && t(errors.note.message as ParseKeys)}
        {...form.register('note')}
      />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {t('transfers.save')}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('transfers.cancel')}
        </Button>
      </div>
    </form>
  )
}
