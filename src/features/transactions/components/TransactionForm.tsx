import { zodResolver } from '@hookform/resolvers/zod'
import type { ParseKeys } from 'i18next'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useMemo, useState } from 'react'
import { Controller, useFieldArray, useForm, useWatch, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { currencyOf, findAccount, useAccountChoices, type Account } from '@/features/accounts'
import { kindTakenBy, useCategoryChoices, type Category } from '@/features/categories'
import { useUserSettings } from '@/features/settings'
import { ComboboxField } from '@/shared/components/ComboboxField'
import { SelectField } from '@/shared/components/SelectField'
import { TextField } from '@/shared/components/TextField'
import { ToggleField } from '@/shared/components/ToggleField'
import { calendarDate, todayIn, type CalendarDate } from '@/shared/dates'
import { useLocale } from '@/shared/i18n/useLocale'
import { typingSettles, useDebounced } from '@/shared/lib/useDebounced'
import { cn } from '@/shared/lib/utils'
import {
  AmountField,
  amountExample,
  fitsCurrency,
  formatMoney,
  isNegativeAmount,
  isZeroAmount,
  remainingAmount,
  requiredAmount,
  unsignedAmount,
  type Currency,
} from '@/shared/money'
import { Button } from '@/shared/ui/button'
import { maxPayeeLength } from '@/shared/api/limits'
import { isStale } from '@/shared/api/versionedSave'
import { maxTagLength, maxTags, tagsQuery } from '../api/tags'
import { TagsField } from './TagsField'
import { isSplit, suggestedCategoryQuery, transactionTypes, type SaveOutcome, type Transaction, type TransactionDraft, type TransactionField } from '../api/transactions'

/**
 * The API's rules (see `Transaction` in the API), repeated here for fast feedback only; the API enforces them
 * again. What depends on the chosen account, the decimals its currency has, is checked on submit.
 */
// What an amount input holds: null when the text is not an amount, '' when it is empty.
const amountAboveZero = requiredAmount({ invalid: 'transactions.errors.amountInvalid', required: 'transactions.errors.amountRequired' }).refine(
  (amount) => !amount || !isZeroAmount(amount),
  { error: 'transactions.errors.amountZero' },
)

/**
 * @param split Whether the transaction is split across lines, which then name its categories: it has none of
 * its own. A transaction that is not split holds no lines. That the lines sum to the amount is checked on submit.
 */
const schemaFor = (today: CalendarDate, split: boolean) =>
  z.object({
    type: z.enum(transactionTypes),
    accountId: z.string().min(1, { error: 'transactions.errors.account' }),
    amount: amountAboveZero,
    // Calendar dates as YYYY-MM-DD sort as text.
    date: calendarDate('transactions.errors.date').refine((date) => date <= today, { error: 'transactions.errors.dateInFuture' }),
    categoryId: z.string().refine((categoryId) => split || categoryId !== '', { error: 'transactions.errors.category' }),
    payee: z.string().trim().max(maxPayeeLength, { error: 'transactions.errors.payeeTooLong' }),
    note: z.string().trim().max(1000, { error: 'transactions.errors.noteTooLong' }),
    lines: z.array(
      z.object({
        categoryId: z.string().min(1, { error: 'transactions.errors.category' }),
        amount: amountAboveZero,
        note: z.string().trim().max(1000, { error: 'transactions.errors.noteTooLong' }),
      }),
    ),
    // A refund: an expense that is money coming back. Only an expense can be one.
    isRefund: z.boolean(),
    // Names as the API keeps them, each once: the field sees to that.
    tags: z.array(z.string()).refine((tags) => tags.length <= maxTags && tags.every((tag) => tag.length <= maxTagLength), { error: 'transactions.errors.tags' }),
  })

type Schema = ReturnType<typeof schemaFor>
/** What the form holds; once validated, the amount is a decimal string. */
type Values = z.input<Schema>

const emptyLine = { categoryId: '', amount: '', note: '' }

/** The message the form shows for each field the API refused. What it refuses about the lines is said once, for all of them. */
const serverErrors: Record<Exclude<TransactionField, 'lines'>, ParseKeys> = {
  type: 'transactions.errors.type',
  accountId: 'transactions.errors.account',
  amount: 'transactions.errors.amountInvalid',
  date: 'transactions.errors.dateInFuture',
  categoryId: 'transactions.errors.category',
  payee: 'transactions.errors.payeeTooLong',
  note: 'transactions.errors.noteTooLong',
  isRefund: 'transactions.errors.refundNotExpense',
  tags: 'transactions.errors.tags',
}

// Named outside JSX, where lint would take a field name for user-facing text.
const amountField = 'amount'
const categoryField = 'categoryId'
const tagsField = 'tags'
const lineAmountField = (index: number) => `lines.${index}.amount` as const
const lineCategoryField = (index: number) => `lines.${index}.categoryId` as const

type Props = {
  /** The form's id, for a button outside it that submits it: the one that tries again after a failure. */
  id?: string
  /** The transaction being edited; none when recording one. */
  transaction?: Transaction
  /** Every account of the user's. Archived ones are offered only to the transaction already on them. */
  accounts: Account[]
  /** The user's category tree, archived categories included; those are offered only to the transaction that has them. */
  categories: Category[]
  /** The account a new transaction starts on, when it is one of those offered: the one used last (spec TXN-8). */
  lastAccountId?: string
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
 * the chosen account decides the currency of the amount. An expense can be flagged as a refund. A new
 * transaction takes the category its payee most often had, until the user chooses one themselves (spec TXN-8).
 */
export function TransactionForm({ id, transaction, accounts, categories, lastAccountId, onSave, onSaved, onCancel }: Props) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { baseCurrency, timeZone } = useUserSettings()
  const today = todayIn(timeZone)
  const [split, setSplit] = useState(transaction !== undefined && isSplit(transaction))
  const schema = useMemo(() => schemaFor(today, split), [today, split])
  const [savedCount, setSavedCount] = useState(0)
  // Whether the user picked the category themselves; until they do, a new transaction takes the one its payee suggests.
  const [pickedCategory, setPickedCategory] = useState(false)
  // Set by a save that was stopped because the lines do not sum to the amount, and by the API refusing the lines.
  const [sumRefused, setSumRefused] = useState(false)
  const [linesRefused, setLinesRefused] = useState(false)
  const refundHintId = useId()

  const accountOptions = accounts.filter((account) => !account.isArchived || account.id === transaction?.accountId)
  const accountChoices = useAccountChoices(accountOptions)
  const form = useForm<Values, unknown, z.output<Schema>>({
    resolver: zodResolver(schema),
    defaultValues: transaction
      ? {
          // Income or an expense: a leg of a transfer opens the transfer form instead, and has no category.
          type: kindTakenBy(transaction.type),
          accountId: transaction.accountId,
          amount: transaction.amount,
          date: transaction.date,
          // A split has no category of its own: its lines name theirs. Neither has a leg of a transfer, which never opens this form.
          categoryId: isSplit(transaction) ? '' : (transaction.categoryId ?? ''),
          payee: transaction.payee ?? '',
          note: transaction.note ?? '',
          isRefund: transaction.isRefund,
          lines: isSplit(transaction) ? transaction.lines.map((line) => ({ ...line, note: line.note ?? '' })) : [],
          tags: transaction.tags,
        }
      : { type: 'expense', accountId: (accountOptions.find((account) => account.id === lastAccountId) ?? accountOptions[0])?.id ?? '', amount: '', date: today, categoryId: '', payee: '', note: '', isRefund: false, lines: [], tags: [] },
  })
  const lines = useFieldArray({ control: form.control, name: 'lines' })
  const { errors, isSubmitting } = form.formState
  const [type, accountId, amount, lineValues, payee, categoryId] = useWatch({ control: form.control, name: ['type', 'accountId', 'amount', 'lines', 'payee', 'categoryId'] })
  const currency = currencyOf(accounts, accountId, baseCurrency)
  // What is left of the amount after the lines entered so far; unknown until there is an amount.
  const remaining = split && amount ? remainingAmount(amount, lineValues.flatMap((line) => (line.amount ? [line.amount] : []))) : null

  const categoryOptions = useCategoryChoices(categories)
    .filter(({ category }) => category.kind === type && (!category.isArchived || transaction?.lines.some((line) => line.categoryId === category.id)))
    .map(({ category, label }) => ({ value: category.id, label }))

  // Only a new transaction is suggested a category: an edited one already has the one the user gave it.
  const settledPayee = useDebounced(payee, typingSettles)
  const suggestion = useQuery(suggestedCategoryQuery({ type, payee: transaction ? '' : settledPayee }))
  const tagSuggestions = useQuery(tagsQuery).data ?? []
  // What the payee typed now suggests, among the categories offered: '' when nothing, undefined while it is not
  // known, which it is not while the payee is still being typed or has just been emptied by a save.
  const suggestedId =
    suggestion.data === undefined || settledPayee !== payee ? undefined : (categoryOptions.find((option) => option.value === suggestion.data)?.value ?? '')
  // Whether the category shown is the one suggested for what is typed now, which the picker says under itself.
  const suggested = !pickedCategory && suggestedId !== undefined && suggestedId !== '' && suggestedId === categoryId
  const { setValue, getValues } = form
  useEffect(() => {
    // What the user picked stays, and a split has no one category to suggest. Until they pick, the category follows the payee: to nothing, if it suggests nothing.
    if (pickedCategory || split || suggestedId === undefined || suggestedId === getValues('categoryId')) return
    setValue('categoryId', suggestedId, { shouldValidate: suggestedId !== '' })
  }, [pickedCategory, split, suggestedId, setValue, getValues])
  const refusedLines = sumRefused ? 'sum' : linesRefused ? 'lines' : null

  // Once the emptied form has rendered, the next transaction starts at the amount.
  useEffect(() => {
    if (savedCount > 0) form.setFocus('amount')
  }, [savedCount, form])

  const typeToggle = form.register('type', {
    // A category of the other kind cannot stay: the type decides which kind it takes, on every line. Nor can
    // the refund flag: only an expense can be a refund.
    onChange: () => {
      form.setValue('categoryId', '')
      form.setValue('isRefund', false)
      setPickedCategory(false)
      form.getValues('lines').forEach((_, index) => form.setValue(`lines.${index}.categoryId`, ''))
    },
  })

  /** Splits the amount across two lines to start with, the first on the category already chosen. */
  const splitIt = () => {
    lines.replace([{ ...emptyLine, categoryId: form.getValues('categoryId') }, emptyLine])
    form.clearErrors('categoryId')
    // From here the categories are the user's: going back to one category keeps the first line's.
    setPickedCategory(true)
    setSplit(true)
  }

  /** One category again: the first line's, for the whole amount. */
  const useOneCategory = () => {
    form.setValue('categoryId', form.getValues('lines')[0]?.categoryId ?? '')
    lines.replace([])
    setSplit(false)
    setSumRefused(false)
    setLinesRefused(false)
  }

  const onSubmit = form.handleSubmit(async (values) => {
    const amount = values.amount as string
    const account = findAccount(accounts, values.accountId)
    // Typed for another account's currency, then moved to one with fewer decimals.
    if (!account || !fitsCurrency(amount, account.currency, locale)) {
      form.setError(account ? 'amount' : 'accountId', { message: account ? 'transactions.errors.amountInvalid' : 'transactions.errors.account' }, { shouldFocus: true })
      return
    }
    const splitLines = split ? values.lines.map((line) => ({ categoryId: line.categoryId, amount: line.amount as string, note: line.note || null })) : null
    if (splitLines) {
      const unfit = splitLines.findIndex((line) => !fitsCurrency(line.amount, account.currency, locale))
      if (unfit !== -1) {
        form.setError(`lines.${unfit}.amount`, { message: 'transactions.errors.amountInvalid' }, { shouldFocus: true })
        return
      }
      // The lines of a split sum exactly to its amount (spec section 3, rule 5): nothing is sent until they do.
      if (!isZeroAmount(remainingAmount(amount, splitLines.map((line) => line.amount)))) {
        setSumRefused(true)
        return
      }
    }
    setLinesRefused(false)

    let outcome: SaveOutcome
    try {
      outcome = await onSave({
        fields: {
          type: values.type,
          accountId: values.accountId,
          amount,
          date: values.date,
          ...(splitLines ? { lines: splitLines } : { categoryId: values.categoryId }),
          payee: values.payee || null,
          note: values.note || null,
          // Only an expense can be a refund.
          isRefund: values.type === 'expense' && values.isRefund,
          // In the order the API answers them, so the list shows them so before it has.
          tags: values.tags.toSorted(),
        },
        currency: account.currency,
      })
    } catch {
      // Whoever saves says that it failed; the form keeps what was entered, to be saved again.
      return
    }
    if (outcome.saved) {
      if (!transaction) {
        form.reset({ type: values.type, accountId: values.accountId, amount: '', date: values.date, categoryId: '', payee: '', note: '', isRefund: false, lines: [], tags: [] })
        setSplit(false)
        setSumRefused(false)
        setPickedCategory(false)
        setSavedCount((count) => count + 1)
      }
      onSaved()
      return
    }
    if (isStale(outcome)) return
    for (const refused of outcome.fields) {
      if (refused === 'lines') setLinesRefused(true)
      else form.setError(refused, { message: serverErrors[refused] }, { shouldFocus: true })
    }
  })

  return (
    <form id={id} noValidate onSubmit={onSubmit} className="space-y-4">
      <ToggleField
        legend={t('transactions.type')}
        options={transactionTypes.map((value) => ({ value, label: t(`transactions.types.${value}`) }))}
        registration={typeToggle}
      />

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
        options={accountChoices}
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
      {/* Before the category, which it suggests. */}
      <TextField
        label={t('transactions.payee')}
        autoComplete="off"
        error={errors.payee?.message && t(errors.payee.message as ParseKeys)}
        {...form.register('payee')}
      />
      {split ? (
        <SplitLines
          control={form.control}
          register={form.register}
          errors={errors.lines}
          lines={lines.fields}
          categoryOptions={categoryOptions}
          currency={currency}
          remaining={remaining}
          refused={refusedLines}
          onAdd={() => lines.append(emptyLine)}
          onRemove={lines.remove}
          onUseOneCategory={useOneCategory}
        />
      ) : (
        <div className="space-y-2">
          <Controller
            control={form.control}
            name={categoryField}
            render={({ field }) => (
              <ComboboxField
                label={t('transactions.category')}
                placeholder={t('transactions.chooseCategory')}
                noMatches={t('transactions.noCategoryMatches')}
                hint={suggested ? t('transactions.categorySuggested') : undefined}
                error={errors.categoryId?.message && t(errors.categoryId.message as ParseKeys)}
                options={categoryOptions}
                ref={field.ref}
                value={field.value}
                onBlur={field.onBlur}
                onChange={(value) => {
                  // Picked, or emptied, by the user: no suggestion replaces it.
                  setPickedCategory(true)
                  field.onChange(value)
                }}
              />
            )}
          />
          <Button type="button" variant="outline" size="sm" onClick={splitIt}>
            {t('transactions.split.start')}
          </Button>
        </div>
      )}
      <TextField
        label={t('transactions.note')}
        autoComplete="off"
        error={errors.note?.message && t(errors.note.message as ParseKeys)}
        {...form.register('note')}
      />
      <Controller
        control={form.control}
        name={tagsField}
        render={({ field }) => (
          <TagsField
            suggestions={tagSuggestions}
            error={errors.tags?.message && t(errors.tags.message as ParseKeys)}
            ref={field.ref}
            value={field.value}
            onBlur={field.onBlur}
            onChange={field.onChange}
          />
        )}
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

/** A split has at least two lines (see `Transaction.MinSplitLines` in the API), and at most fifty. */
const minLines = 2
const maxLines = 50

type SplitLinesProps = {
  control: Control<Values, unknown, z.output<Schema>>
  register: UseFormRegister<Values>
  errors: FieldErrors<Values>['lines']
  /** The lines as the form keeps them: one key each, to tell them apart when one is removed. */
  lines: { id: string }[]
  /** The categories of the transaction's type. */
  categoryOptions: { value: string; label: string }[]
  currency: Currency
  /** What is left of the amount after the lines, as a decimal string; null until there is an amount. */
  remaining: string | null
  /** Why the last save was stopped, if it was about the lines: they do not sum to the amount, or the API refused them. */
  refused: 'sum' | 'lines' | null
  onAdd: () => void
  onRemove: (index: number) => void
  onUseOneCategory: () => void
}

/**
 * The lines of a split transaction: a category, an amount and an optional note each. Under them, what remains
 * of the transaction's amount to split, which must be nothing before the transaction can be saved.
 */
function SplitLines({ control, register, errors, lines, categoryOptions, currency, remaining, refused, onAdd, onRemove, onUseOneCategory }: SplitLinesProps) {
  const { t } = useTranslation()
  const locale = useLocale()
  const left = remaining === null || isZeroAmount(remaining) ? null : formatMoney(unsignedAmount(remaining), currency, locale)
  const over = remaining !== null && isNegativeAmount(remaining)

  return (
    <fieldset className="space-y-3 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">{t('transactions.split.lines')}</legend>
      {lines.map((line, index) => {
        const number = index + 1
        const lineErrors = errors?.[index]
        return (
          <div key={line.id} role="group" aria-label={t('transactions.split.line', { number })} className="space-y-2 border-b pb-3">
            <Controller
              control={control}
              name={lineCategoryField(index)}
              render={({ field }) => (
                <ComboboxField
                  label={t('transactions.split.lineCategory', { number })}
                  placeholder={t('transactions.chooseCategory')}
                  noMatches={t('transactions.noCategoryMatches')}
                  error={lineErrors?.categoryId?.message && t(lineErrors.categoryId.message as ParseKeys)}
                  options={categoryOptions}
                  ref={field.ref}
                  value={field.value}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                />
              )}
            />
            <AmountField
              control={control}
              name={lineAmountField(index)}
              label={t('transactions.split.lineAmount', { number, currency })}
              error={lineErrors?.amount?.message && t(lineErrors.amount.message as ParseKeys, { example: amountExample(locale, currency) })}
              currency={currency}
            />
            <TextField
              label={t('transactions.split.lineNote', { number })}
              autoComplete="off"
              error={lineErrors?.note?.message && t(lineErrors.note.message as ParseKeys)}
              {...register(`lines.${index}.note`)}
            />
            {lines.length > minLines && (
              <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(index)}>
                {t('transactions.split.removeLine', { number })}
              </Button>
            )}
          </div>
        )
      })}

      {/* Says what remains as the lines are filled in; it must be nothing before the transaction can be saved. */}
      <p role="status" data-testid="remaining" className={cn('text-sm font-medium', left !== null && 'text-destructive')}>
        {remaining !== null && (left === null ? t('transactions.split.nothingLeft') : t(over ? 'transactions.split.over' : 'transactions.split.left', { amount: left }))}
      </p>
      {refused === 'sum' && left !== null && (
        <p role="alert" className="text-sm text-destructive">
          {t(over ? 'transactions.errors.linesOver' : 'transactions.errors.linesLeft', { amount: left })}
        </p>
      )}
      {refused === 'lines' && (
        <p role="alert" className="text-sm text-destructive">
          {t('transactions.errors.lines')}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {lines.length < maxLines && (
          <Button type="button" variant="outline" size="sm" onClick={onAdd}>
            {t('transactions.split.addLine')}
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onUseOneCategory}>
          {t('transactions.split.useOneCategory')}
        </Button>
      </div>
    </fieldset>
  )
}
