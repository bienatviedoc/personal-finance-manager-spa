import { zodResolver } from '@hookform/resolvers/zod'
import type { ParseKeys } from 'i18next'
import { useEffect, useId, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import type { Account } from '@/features/accounts'
import type { Category } from '@/features/categories'
import { useUserSettings } from '@/features/settings'
import { SelectField } from '@/shared/components/SelectField'
import { TextField } from '@/shared/components/TextField'
import { calendarDate, todayIn, type CalendarDate } from '@/shared/dates'
import { useLocale } from '@/shared/i18n/useLocale'
import { cn, focusRingWithin } from '@/shared/lib/utils'
import { AmountField, amountExample, formatAmountForInput, isZeroAmount, parseAmount, requiredAmount } from '@/shared/money'
import { Button } from '@/shared/ui/button'
import { isStale } from '@/shared/api/versionedSave'
import { transactionTypes, type SaveOutcome, type Transaction, type TransactionDraft, type TransactionField } from '../api/transactions'

/**
 * The API's rules (see `Transaction` in the API), repeated here for fast feedback only; the API enforces them
 * again. What depends on the chosen account, the decimals its currency has, is checked on submit.
 */
const schemaFor = (today: CalendarDate) =>
  z.object({
    type: z.enum(transactionTypes),
    accountId: z.string().min(1, { error: 'transactions.errors.account' }),
    // What the amount input holds: null when the text is not an amount, '' when it is empty.
    amount: requiredAmount({ invalid: 'transactions.errors.amountInvalid', required: 'transactions.errors.amountRequired' }).refine(
      (amount) => !amount || !isZeroAmount(amount),
      { error: 'transactions.errors.amountZero' },
    ),
    // Calendar dates as YYYY-MM-DD sort as text.
    date: calendarDate('transactions.errors.date').refine((date) => date <= today, { error: 'transactions.errors.dateInFuture' }),
    categoryId: z.string().min(1, { error: 'transactions.errors.category' }),
    payee: z.string().trim().max(200, { error: 'transactions.errors.payeeTooLong' }),
    note: z.string().trim().max(1000, { error: 'transactions.errors.noteTooLong' }),
    // A refund: an expense that is money coming back. Only an expense can be one.
    isRefund: z.boolean(),
  })

type Schema = ReturnType<typeof schemaFor>
/** What the form holds; once validated, the amount is a decimal string. */
type Values = z.input<Schema>

/** The message the form shows for each field the API refused. */
const serverErrors: Record<TransactionField, ParseKeys> = {
  type: 'transactions.errors.type',
  accountId: 'transactions.errors.account',
  amount: 'transactions.errors.amountInvalid',
  date: 'transactions.errors.dateInFuture',
  categoryId: 'transactions.errors.category',
  payee: 'transactions.errors.payeeTooLong',
  note: 'transactions.errors.noteTooLong',
  isRefund: 'transactions.errors.refundNotExpense',
}

// Named outside JSX, where lint would take a field name for user-facing text.
const amountField = 'amount'

type Props = {
  /** The form's id, for a button outside it that submits it: the one that tries again after a failure. */
  id?: string
  /** The transaction being edited; none when recording one. */
  transaction?: Transaction
  /** Every account of the user's. Archived ones are offered only to the transaction already on them. */
  accounts: Account[]
  /** The user's category tree, archived categories included; those are offered only to the transaction that has them. */
  categories: Category[]
  onSave: (draft: TransactionDraft) => Promise<SaveOutcome>
  /**
   * Called once the transaction is saved. A form that records stays as it is for the next transaction, keeping the
   * type, account and date; one that edits is done.
   */
  onSaved: () => void
  onCancel: () => void
}

/**
 * Records or edits income or an expense. The type toggle at the top decides which categories are offered;
 * the chosen account decides the currency of the amount. An expense can be flagged as a refund.
 */
export function TransactionForm({ id, transaction, accounts, categories, onSave, onSaved, onCancel }: Props) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { baseCurrency, timeZone } = useUserSettings()
  const today = todayIn(timeZone)
  const schema = useMemo(() => schemaFor(today), [today])
  const [savedCount, setSavedCount] = useState(0)
  const refundHintId = useId()

  const accountOptions = accounts.filter((account) => !account.isArchived || account.id === transaction?.accountId)
  const form = useForm<Values, unknown, z.output<Schema>>({
    resolver: zodResolver(schema),
    defaultValues: transaction
      ? {
          // Income or an expense: a leg of a transfer opens the transfer form instead, and has no category.
          type: transaction.type === 'income' ? 'income' : 'expense',
          accountId: transaction.accountId,
          amount: transaction.amount,
          date: transaction.date,
          categoryId: transaction.categoryId ?? '',
          payee: transaction.payee ?? '',
          note: transaction.note ?? '',
          isRefund: transaction.isRefund,
        }
      : { type: 'expense', accountId: accountOptions[0]?.id ?? '', amount: '', date: today, categoryId: '', payee: '', note: '', isRefund: false },
  })
  const { errors, isSubmitting } = form.formState
  const [type, accountId] = useWatch({ control: form.control, name: ['type', 'accountId'] })
  const currency = accounts.find((account) => account.id === accountId)?.currency ?? baseCurrency

  const categoryOptions = categories
    .flatMap((category) => [
      { category, label: category.name },
      ...category.subcategories.map((subcategory) => ({ category: subcategory, label: t('transactions.subcategory', { parent: category.name, name: subcategory.name }) })),
    ])
    .filter(({ category }) => category.kind === type && (!category.isArchived || category.id === transaction?.categoryId))
    .map(({ category, label }) => ({ value: category.id, label }))

  // Once the emptied form has rendered, the next transaction starts at the amount.
  useEffect(() => {
    if (savedCount > 0) form.setFocus('amount')
  }, [savedCount, form])

  const typeToggle = form.register('type', {
    // A category of the other kind cannot stay: the type decides which kind it takes. Nor can the refund
    // flag: only an expense can be a refund.
    onChange: () => {
      form.setValue('categoryId', '')
      form.setValue('isRefund', false)
    },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    const amount = values.amount as string
    const account = accounts.find((candidate) => candidate.id === values.accountId)
    // Typed for another account's currency, then moved to one with fewer decimals.
    if (!account || parseAmount(formatAmountForInput(amount, locale, account.currency), locale, account.currency) === null) {
      form.setError(account ? 'amount' : 'accountId', { message: account ? 'transactions.errors.amountInvalid' : 'transactions.errors.account' }, { shouldFocus: true })
      return
    }

    let outcome: SaveOutcome
    try {
      outcome = await onSave({
        fields: {
          type: values.type,
          accountId: values.accountId,
          amount,
          date: values.date,
          categoryId: values.categoryId,
          payee: values.payee || null,
          note: values.note || null,
          // Only an expense can be a refund.
          isRefund: values.type === 'expense' && values.isRefund,
        },
        currency: account.currency,
      })
    } catch {
      // Whoever saves says that it failed; the form keeps what was entered, to be saved again.
      return
    }
    if (outcome.saved) {
      if (!transaction) {
        form.reset({ type: values.type, accountId: values.accountId, amount: '', date: values.date, categoryId: '', payee: '', note: '', isRefund: false })
        setSavedCount((count) => count + 1)
      }
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
      <fieldset>
        <legend className="sr-only">{t('transactions.type')}</legend>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {transactionTypes.map((value) => (
            <label
              key={value}
              className={cn(
                'cursor-pointer rounded-md px-3 py-1.5 text-center text-sm font-medium text-muted-foreground has-checked:bg-background has-checked:text-foreground has-checked:shadow-sm',
                focusRingWithin,
              )}
            >
              <input type="radio" value={value} className="sr-only" {...typeToggle} />
              {t(`transactions.types.${value}`)}
            </label>
          ))}
        </div>
      </fieldset>

      {type === 'expense' && (
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" aria-describedby={refundHintId} {...form.register('isRefund')} />
            {t('transactions.isRefund')}
          </label>
          <p id={refundHintId} className="text-sm text-muted-foreground">
            {t('transactions.refundHint')}
          </p>
          {errors.isRefund?.message && <p className="text-sm text-destructive">{t(errors.isRefund.message as ParseKeys)}</p>}
        </div>
      )}

      <SelectField
        label={t('transactions.account')}
        error={errors.accountId?.message && t(errors.accountId.message as ParseKeys)}
        options={accountOptions.map((account) => ({ value: account.id, label: t('transactions.accountOption', { name: account.name, currency: account.currency }) }))}
        {...form.register('accountId')}
      />

      <AmountField
        control={form.control}
        name={amountField}
        label={t('transactions.amountIn', { currency })}
        error={errors.amount?.message && t(errors.amount.message as ParseKeys, { example: amountExample(locale, currency) })}
        currency={currency}
      />

      <TextField
        type="date"
        max={today}
        label={t('transactions.date')}
        error={errors.date?.message && t(errors.date.message as ParseKeys)}
        {...form.register('date')}
      />
      <SelectField
        label={t('transactions.category')}
        error={errors.categoryId?.message && t(errors.categoryId.message as ParseKeys)}
        options={[{ value: '', label: t('transactions.chooseCategory') }, ...categoryOptions]}
        {...form.register('categoryId')}
      />
      <TextField
        label={t('transactions.payee')}
        autoComplete="off"
        error={errors.payee?.message && t(errors.payee.message as ParseKeys)}
        {...form.register('payee')}
      />
      <TextField
        label={t('transactions.note')}
        autoComplete="off"
        error={errors.note?.message && t(errors.note.message as ParseKeys)}
        {...form.register('note')}
      />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {t('transactions.save')}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {savedCount > 0 ? t('transactions.done') : t('transactions.cancel')}
        </Button>
      </div>
      {/* Says the transaction was saved when the form has emptied itself for the next one. */}
      <p role="status" className="text-sm text-muted-foreground">
        {savedCount > 0 && !isSubmitting && t('transactions.savedAddAnother', { count: savedCount })}
      </p>
    </form>
  )
}
