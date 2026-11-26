import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import type { ParseKeys } from 'i18next'
import { useId, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { z } from 'zod'
import { accountsQuery, findAccount, type Account } from '@/features/accounts'
import { categoriesQuery, findCategory, type Category } from '@/features/categories'
import { useUserSettings } from '@/features/settings'
import { takesFromBalance } from '@/features/transactions'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { FailureToast } from '@/shared/components/FailureToast'
import { TextField } from '@/shared/components/TextField'
import { calendarDate, formatDate, todayIn } from '@/shared/dates'
import { useLocale } from '@/shared/i18n/useLocale'
import { joinDetails } from '@/shared/lib/details'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { AmountField, amountExample, isZeroAmount, Money, requiredAmount, signedAmount, type AmountValue } from '@/shared/money'
import { Button } from '@/shared/ui/button'
import {
  latestReconciliationQuery,
  transactionsToTickQuery,
  useCancelReconciliation,
  useCompleteReconciliation,
  useReopenReconciliation,
  useStartReconciliation,
  useTick,
  type Reconciliation,
  type StartField,
  type TransactionToTick,
} from '../api/reconciliations'

/**
 * Reconciling an account against a bank statement (spec ACC-7): the user enters the statement's closing date
 * and balance, ticks the transactions the statement shows, and completes it once the difference is exactly
 * zero, which locks them. The difference is the API's; nothing here adds up or adjusts anything. A completed
 * reconciliation can be reopened, and the next statement started.
 */
export function ReconcilePage() {
  const { t } = useTranslation()
  const { accountId = '' } = useParams()
  const accounts = useQuery(accountsQuery({ includeArchived: true }))
  const latest = useQuery(latestReconciliationQuery(accountId))
  const account = accounts.data ? findAccount(accounts.data.accounts, accountId) : undefined
  const title = account ? t('reconciliations.title', { name: account.name }) : t('screens.reconcile')
  useDocumentTitle(title)

  return (
    <section className="max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold break-words">{title}</h1>
        <p className="text-muted-foreground">{t('reconciliations.intro')}</p>
        <Link className="text-sm underline" to="/accounts">
          {t('reconciliations.toAccounts')}
        </Link>
      </div>

      {(accounts.isError || latest.isError) && <ErrorMessage>{t('reconciliations.errors.generic')}</ErrorMessage>}
      {accounts.data && !account && <ErrorMessage>{t('reconciliations.errors.noAccount')}</ErrorMessage>}
      {(!accounts.data || latest.data === undefined) && !accounts.isError && !latest.isError && (
        <p aria-busy className="text-muted-foreground">
          {t('reconciliations.loading')}
        </p>
      )}
      {account && latest.data !== undefined && (
        <>
          {latest.data?.status === 'inProgress' ? (
            <InProgress reconciliation={latest.data} />
          ) : (
            <>
              {latest.data && <Completed reconciliation={latest.data} />}
              <StartReconciliation account={account} />
            </>
          )}
        </>
      )}
    </section>
  )
}

const schemaFor = (today: string) =>
  z.object({
    statementDate: calendarDate('reconciliations.errors.statementDate').refine((date) => date <= today, { error: 'reconciliations.errors.statementDateInFuture' }),
    statementBalance: requiredAmount({ invalid: 'reconciliations.errors.balanceInvalid', required: 'reconciliations.errors.balanceRequired' }),
  })

type Values = { statementDate: string; statementBalance: AmountValue }
const balanceField = 'statementBalance'

/** The message the form shows for each field the API refused. */
const serverErrors: Record<StartField, ParseKeys> = {
  statementDate: 'reconciliations.errors.statementDateRefused',
  statementBalance: 'reconciliations.errors.balanceInvalid',
}

/** Starts reconciling against a statement: its closing date and closing balance, below zero for what is owed. */
function StartReconciliation({ account }: { account: Account }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const formId = useId()
  const { timeZone } = useUserSettings()
  const today = todayIn(timeZone)
  const schema = useMemo(() => schemaFor(today), [today])
  const start = useStartReconciliation(account.id)
  const form = useForm<Values, unknown, z.output<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { statementDate: '', statementBalance: '' } })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    const outcome = await start.mutateAsync({ statementDate: values.statementDate, statementBalance: values.statementBalance! })
    if (outcome.saved || !('fields' in outcome)) return
    for (const refused of outcome.fields) form.setError(refused, { message: serverErrors[refused] }, { shouldFocus: true })
  })

  return (
    <form id={formId} noValidate onSubmit={onSubmit} aria-label={t('reconciliations.start')} className="space-y-4 rounded-lg border p-4">
      <h2 className="text-lg font-semibold">{t('reconciliations.newStatement')}</h2>
      <TextField
        type="date"
        max={today}
        label={t('reconciliations.statementDate')}
        error={errors.statementDate?.message && t(errors.statementDate.message as ParseKeys)}
        {...form.register('statementDate')}
      />
      <AmountField
        control={form.control}
        name={balanceField}
        label={t('reconciliations.closingBalanceIn', { currency: account.currency })}
        hint={t('reconciliations.closingBalanceHint')}
        error={errors.statementBalance?.message && t(errors.statementBalance.message as ParseKeys, { example: amountExample(locale, account.currency) })}
        currency={account.currency}
        allowNegative
      />
      {start.data && !start.data.saved && 'inProgress' in start.data && <ErrorMessage>{t('reconciliations.errors.inProgress')}</ErrorMessage>}
      <Button type="submit" disabled={isSubmitting}>
        {t('reconciliations.start')}
      </Button>
      <FailureToast failed={start.isError} message={t('reconciliations.errors.notStarted')} retry={{ form: formId }} onDismiss={start.reset} />
    </form>
  )
}

/** The reconciliation being worked on: its figures, the transactions to tick, and completing or cancelling it. */
function InProgress({ reconciliation }: { reconciliation: Reconciliation }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const transactions = useQuery(transactionsToTickQuery(reconciliation.id))
  const categories = useQuery(categoriesQuery({ includeArchived: true }))
  const complete = useCompleteReconciliation(reconciliation)
  const cancel = useCancelReconciliation(reconciliation)
  const balanced = isZeroAmount(reconciliation.difference)
  const hintId = useId()

  return (
    <div className="space-y-4">
      <Figures reconciliation={reconciliation} />

      {transactions.isError && <ErrorMessage>{t('reconciliations.errors.generic')}</ErrorMessage>}
      {transactions.data?.length === 0 && <p className="text-muted-foreground">{t('reconciliations.nothingToTick', { date: formatDate(reconciliation.statementDate, locale) })}</p>}
      {transactions.data && transactions.data.length > 0 && (
        <ul aria-label={t('reconciliations.toTick')} className="divide-y rounded-lg border">
          {transactions.data.map((transaction) => (
            <TickRow key={transaction.id} reconciliation={reconciliation} transaction={transaction} categories={categories.data ?? []} />
          ))}
        </ul>
      )}

      <div className="space-y-2">
        {!balanced && (
          <p id={hintId} className="text-sm text-muted-foreground">
            {t('reconciliations.completeWhenZero')}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!balanced || complete.isPending} aria-describedby={balanced ? undefined : hintId} onClick={() => complete.mutate()}>
            {t('reconciliations.complete')}
          </Button>
          <Button variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
            {t('reconciliations.cancel')}
          </Button>
        </div>
      </div>
      <FailureToast failed={complete.isError} message={t('reconciliations.errors.notCompleted')} retry={() => complete.mutate()} onDismiss={complete.reset} />
      <FailureToast failed={cancel.isError} message={t('reconciliations.errors.notCancelled')} retry={() => cancel.mutate()} onDismiss={cancel.reset} />
    </div>
  )
}

/** The statement against the account, as the API works them out: the difference is what is still to reach zero. */
function Figures({ reconciliation }: { reconciliation: Reconciliation }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { currency } = reconciliation

  return (
    <dl className="grid gap-2 rounded-lg border bg-muted/40 p-3 text-sm sm:grid-cols-2">
      <div className="flex flex-wrap justify-between gap-x-2">
        <dt className="text-muted-foreground">{t('reconciliations.statementDate')}</dt>
        <dd>{formatDate(reconciliation.statementDate, locale)}</dd>
      </div>
      <div className="flex flex-wrap justify-between gap-x-2">
        <dt className="text-muted-foreground">{t('reconciliations.closingBalance')}</dt>
        <dd className="tabular-nums">
          <Money amount={reconciliation.statementBalance} currency={currency} />
        </dd>
      </div>
      <div className="flex flex-wrap justify-between gap-x-2">
        <dt className="text-muted-foreground">{t('reconciliations.reconciledBalance')}</dt>
        <dd className="tabular-nums">
          <Money amount={reconciliation.reconciledBalance} currency={currency} />
        </dd>
      </div>
      <div className="flex flex-wrap justify-between gap-x-2">
        <dt className="text-muted-foreground">{t('reconciliations.tickedTotal')}</dt>
        <dd className="tabular-nums">
          <Money amount={reconciliation.tickedTotal} currency={currency} />
        </dd>
      </div>
      <div data-testid="difference" className="flex flex-wrap justify-between gap-x-2 text-base font-semibold sm:col-span-2">
        <dt>{t('reconciliations.difference')}</dt>
        <dd className="tabular-nums" aria-live="polite">
          <Money amount={reconciliation.difference} currency={currency} />
        </dd>
      </div>
    </dl>
  )
}

/** One transaction to tick. While the API has not answered, the box shows what was asked. */
function TickRow({ reconciliation, transaction, categories }: { reconciliation: Reconciliation; transaction: TransactionToTick; categories: Category[] }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const tick = useTick(reconciliation)
  const category = transaction.categoryId ? findCategory(categories, transaction.categoryId) : undefined
  const name = transaction.payee ?? category?.name ?? t(`transactions.types.${transaction.type}`)
  const ticked = tick.isPending ? tick.variables.ticked : transaction.isTicked
  const toggle = () => tick.mutate({ transactionId: transaction.id, ticked: !ticked })

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
      <input type="checkbox" className="size-4" aria-label={t('reconciliations.tick', { name })} checked={ticked} disabled={tick.isPending} onChange={toggle} />
      <div className="min-w-24 flex-1">
        <h3 className="font-medium break-words">{name}</h3>
        <p className="text-sm text-muted-foreground">{joinDetails([category?.name, formatDate(transaction.date, locale)])}</p>
      </div>
      <span className="font-medium tabular-nums">
        {transaction.isRefund && '+'}
        <Money amount={signedAmount(transaction.amount, takesFromBalance(transaction))} currency={transaction.currency} />
      </span>
      <FailureToast failed={tick.isError} message={t('reconciliations.errors.notTicked')} retry={toggle} onDismiss={tick.reset} />
    </li>
  )
}

/** The account's last reconciliation, completed: what it locked, and reopening it. */
function Completed({ reconciliation }: { reconciliation: Reconciliation }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const reopen = useReopenReconciliation(reconciliation)

  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-success/40 bg-success/10 p-3">
      <p className="min-w-24 flex-1">{t('reconciliations.completed', { date: formatDate(reconciliation.statementDate, locale) })}</p>
      <Button variant="outline" size="sm" disabled={reopen.isPending} onClick={() => reopen.mutate()}>
        {t('reconciliations.reopen')}
      </Button>
      <FailureToast failed={reopen.isError} message={t('reconciliations.errors.notReopened')} retry={() => reopen.mutate()} onDismiss={reopen.reset} />
    </div>
  )
}
