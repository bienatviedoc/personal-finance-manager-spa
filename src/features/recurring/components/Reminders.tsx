import { zodResolver } from '@hookform/resolvers/zod'
import type { ParseKeys } from 'i18next'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { findCategory, kindTakenBy, type Category } from '@/features/categories'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { FailureToast } from '@/shared/components/FailureToast'
import { formatDate } from '@/shared/dates'
import { useLocale } from '@/shared/i18n/useLocale'
import { AmountField, amountExample, isZeroAmount, Money, requiredAmount, sameAmount, signedAmount } from '@/shared/money'
import { Button } from '@/shared/ui/button'
import { useConfirmReminder, useDismissReminder, type Occurrence, type ReminderOutcome } from '../api/recurringRules'
import { occurrenceTitle } from './occurrenceTitle'

type Props = { reminders: Occurrence[]; categories: Category[] }

/**
 * The occurrences of rules that remind, due by today and waiting for the user: each is confirmed, which
 * records its transaction (for another amount if the user enters one), or dismissed, which records nothing.
 */
export function Reminders({ reminders, categories }: Props) {
  const { t } = useTranslation()
  const headingId = useId()

  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h2 id={headingId} className="text-lg font-semibold">
        {t('recurring.reminders')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('recurring.remindersIntro')}</p>
      <ul aria-label={t('recurring.reminders')} className="divide-y rounded-lg border">
        {reminders.map((reminder) => (
          <ReminderRow key={`${reminder.recurringRuleId}:${reminder.dueDate}`} reminder={reminder} category={findCategory(categories, reminder.categoryId)} />
        ))}
      </ul>
    </section>
  )
}

function ReminderRow({ reminder, category }: { reminder: Occurrence; category?: Category }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const dismiss = useDismissReminder()
  const [confirming, setConfirming] = useState(false)
  const [earlierFirst, setEarlierFirst] = useState(false)
  // A rule is only ever income or an expense.
  const type = kindTakenBy(reminder.type)
  const title = occurrenceTitle(reminder, category, t(`recurring.types.${type}`))
  const date = formatDate(reminder.dueDate, locale)

  const answered = (outcome: ReminderOutcome) => {
    if (!outcome.saved && outcome.fields.includes('dueDate')) setEarlierFirst(true)
  }

  return (
    <li className="space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-24 flex-1">
          <h3 className="font-medium break-words">{title}</h3>
          <p data-testid="due" className="text-sm text-muted-foreground">
            {t('recurring.dueOn', { date })}
          </p>
        </div>
        <span data-testid="amount" className="font-medium tabular-nums">
          <Money amount={signedAmount(reminder.amount, type === 'expense')} currency={reminder.currency} />
        </span>
        {!confirming && (
          <>
            <Button size="sm" aria-label={t('recurring.confirmNamed', { name: title, date })} onClick={() => setConfirming(true)}>
              {t('recurring.confirm')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={dismiss.isPending}
              aria-label={t('recurring.dismissNamed', { name: title, date })}
              onClick={async () => answered(await dismiss.mutateAsync(reminder))}
            >
              {t('recurring.dismiss')}
            </Button>
          </>
        )}
      </div>
      {earlierFirst && <ErrorMessage>{t('recurring.errors.answerEarlierFirst')}</ErrorMessage>}
      {confirming && <ConfirmReminder reminder={reminder} title={title} onAnswered={answered} onCancel={() => setConfirming(false)} />}
      <FailureToast failed={dismiss.isError} message={t('recurring.errors.notAnswered')} retry={() => dismiss.mutate(reminder)} onDismiss={dismiss.reset} />
    </li>
  )
}

const schema = z.object({
  // What the amount input holds: null when the text is not an amount, '' when it is empty.
  amount: requiredAmount({ invalid: 'recurring.errors.amountInvalid', required: 'recurring.errors.amountRequired' }).refine(
    (amount) => !amount || !isZeroAmount(amount),
    { error: 'recurring.errors.amountZero' },
  ),
})

// Named outside JSX, where lint would take a field name for user-facing text.
const amountField = 'amount'

type ConfirmProps = { reminder: Occurrence; title: string; onAnswered: (outcome: ReminderOutcome) => void; onCancel: () => void }

/** Confirms a reminder for the rule's amount, or for another one the user enters. */
function ConfirmReminder({ reminder, title, onAnswered, onCancel }: ConfirmProps) {
  const { t } = useTranslation()
  const locale = useLocale()
  const formId = useId()
  const confirm = useConfirmReminder()
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { amount: reminder.amount },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    const amount = values.amount as string
    let outcome: ReminderOutcome
    try {
      // The rule's own amount is left out, for the API to take it from the rule.
      outcome = await confirm.mutateAsync({ ...reminder, amount: sameAmount(amount, reminder.amount) ? undefined : amount })
    } catch {
      // The toast says that it failed; the form keeps what was entered, to be confirmed again.
      return
    }
    if (!outcome.saved && outcome.fields.includes('amount')) form.setError('amount', { message: 'recurring.errors.amountInvalid' }, { shouldFocus: true })
    onAnswered(outcome)
  })

  return (
    <div role="group" aria-label={t('recurring.confirmTitle', { name: title })} className="space-y-2 rounded-md bg-muted p-3">
      <form id={formId} noValidate onSubmit={onSubmit} className="space-y-2">
        <AmountField
          control={form.control}
          name={amountField}
          label={t('recurring.amountIn', { currency: reminder.currency })}
          error={errors.amount?.message && t(errors.amount.message as ParseKeys, { example: amountExample(locale, reminder.currency) })}
          currency={reminder.currency}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {t('recurring.record')}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            {t('recurring.cancel')}
          </Button>
        </div>
      </form>
      <FailureToast failed={confirm.isError} message={t('recurring.errors.notAnswered')} retry={{ form: formId }} onDismiss={confirm.reset} />
    </div>
  )
}
