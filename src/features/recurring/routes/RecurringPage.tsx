import { useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { accountsQuery, findAccount, type Account } from '@/features/accounts'
import { CategoryBadge, categoriesQuery, findCategory, kindTakenBy, type Category } from '@/features/categories'
import { Drawer } from '@/shared/components/Drawer'
import { isStale } from '@/shared/api/versionedSave'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { FailureToast } from '@/shared/components/FailureToast'
import { formatDate } from '@/shared/dates'
import { useLocale } from '@/shared/i18n/useLocale'
import { joinDetails } from '@/shared/lib/details'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { cn } from '@/shared/lib/utils'
import { Money, signedAmount } from '@/shared/money'
import { Button } from '@/shared/ui/button'
import {
  recurringRulesQuery,
  useCreateRecurringRule,
  useDeleteRecurringRule,
  useEditRecurringRule,
  usePauseRecurringRule,
  useResumeRecurringRule,
  type RecurringRule,
} from '../api/recurringRules'
import { RecurringRuleForm } from '../components/RecurringRuleForm'
import { linkedRuleParameter } from '../components/RecurringRuleLink'

/** What the drawer is open for: setting up a rule, or editing the one with this id. */
type Drawer = { adding: true } | { editing: string } | null

/**
 * The user's recurring rules: income and expenses that repeat, which the API's worker records on each due
 * date. Rules are set up and edited in a side drawer, and paused, resumed and deleted from the list. A
 * transaction a rule posted links here, and the rule it names is pointed out.
 */
export function RecurringPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('screens.recurring'))
  const [drawer, setDrawer] = useState<Drawer>(null)
  const [search] = useSearchParams()
  const linkedRule = search.get(linkedRuleParameter)
  const rules = useQuery(recurringRulesQuery)
  // Archived accounts and categories are loaded too: the rules on them still show their names.
  const accounts = useQuery(accountsQuery({ includeArchived: true }))
  const categories = useQuery(categoriesQuery({ includeArchived: true }))

  const editing = drawer && 'editing' in drawer ? rules.data?.find((rule) => rule.id === drawer.editing) : undefined
  const canSetUp = accounts.data?.accounts.some((account) => !account.isArchived) ?? false
  const loaded = rules.data !== undefined && accounts.data !== undefined && categories.data !== undefined

  return (
    <section className="max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{t('screens.recurring')}</h1>
        <p className="text-muted-foreground">{t('recurring.intro')}</p>
      </div>

      {accounts.data && !canSetUp ? (
        <p className="text-muted-foreground">
          {t('recurring.noAccounts')}{' '}
          <Link className="underline" to="/accounts">
            {t('recurring.toAccounts')}
          </Link>
        </p>
      ) : (
        <Button disabled={!loaded} onClick={() => setDrawer({ adding: true })}>
          {t('recurring.add')}
        </Button>
      )}

      {(rules.isError || accounts.isError || categories.isError) && <ErrorMessage>{t('recurring.errors.generic')}</ErrorMessage>}
      {!loaded && !rules.isError && <ListSkeleton />}
      {loaded && rules.data.length === 0 && canSetUp && <p className="text-muted-foreground">{t('recurring.empty')}</p>}
      {loaded && rules.data.length > 0 && (
        <ul aria-label={t('recurring.list')} className="divide-y rounded-lg border">
          {rules.data.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              account={findAccount(accounts.data.accounts, rule.accountId)}
              category={findCategory(categories.data, rule.categoryId)}
              linked={rule.id === linkedRule}
              onEdit={() => setDrawer({ editing: rule.id })}
            />
          ))}
        </ul>
      )}

      <Drawer open={drawer !== null} onOpenChange={(open) => !open && setDrawer(null)} title={editing ? t('recurring.editTitle') : t('recurring.new')}>
          {loaded && drawer && 'adding' in drawer && (
            <AddRule accounts={accounts.data.accounts} categories={categories.data} onClose={() => setDrawer(null)} />
          )}
          {loaded && editing && <EditRule rule={editing} accounts={accounts.data.accounts} categories={categories.data} onClose={() => setDrawer(null)} />}
      </Drawer>
    </section>
  )
}

type FormProps = { accounts: Account[]; categories: Category[]; onClose: () => void }

function AddRule({ accounts, categories, onClose }: FormProps) {
  const { t } = useTranslation()
  const formId = useId()
  const create = useCreateRecurringRule()

  return (
    <>
      <RecurringRuleForm id={formId} accounts={accounts} categories={categories} onSave={create.mutateAsync} onSaved={onClose} onCancel={onClose} />
      <FailureToast failed={create.isError} message={t('recurring.errors.notSaved')} retry={{ form: formId }} onDismiss={create.reset} />
    </>
  )
}

function EditRule({ rule, accounts, categories, onClose }: FormProps & { rule: RecurringRule }) {
  const { t } = useTranslation()
  const formId = useId()
  const edit = useEditRecurringRule(rule)
  const stale = isStale(edit.data)

  return (
    <>
      {stale && <ErrorMessage>{t('recurring.errors.stale')}</ErrorMessage>}
      {/* A new row version is a new rule to edit: the form starts again from what the API holds now. */}
      <RecurringRuleForm
        key={rule.rowVersion}
        id={formId}
        rule={rule}
        accounts={accounts}
        categories={categories}
        onSave={edit.mutateAsync}
        onSaved={onClose}
        onCancel={onClose}
      />
      <FailureToast failed={edit.isError} message={t('recurring.errors.notSaved')} retry={{ form: formId }} onDismiss={edit.reset} />
    </>
  )
}

type RowProps = { rule: RecurringRule; account?: Account; category?: Category; linked: boolean; onEdit: () => void }

function RuleRow({ rule, account, category, linked, onEdit }: RowProps) {
  const { t } = useTranslation()
  const locale = useLocale()
  const pause = usePauseRecurringRule()
  const resume = useResumeRecurringRule()
  const remove = useDeleteRecurringRule()
  const [confirming, setConfirming] = useState(false)
  // A rule is only ever income or an expense.
  const type = kindTakenBy(rule.type)
  // A rule is known by who is paid; without a payee, by what it is for.
  const title = rule.payee ?? category?.name ?? t(`recurring.types.${type}`)
  const frequency = rule.frequency === 'everyNDays' ? t('recurring.everyDays', { count: Number(rule.interval) }) : t(`recurring.frequencies.${rule.frequency}`)
  const toggle = rule.isPaused ? resume : pause

  return (
    <li
      // Brought into view when a transaction's link names this rule. jsdom has no scrollIntoView.
      ref={(item) => {
        if (linked) item?.scrollIntoView?.({ block: 'center' })
      }}
      aria-current={linked ? 'true' : undefined}
      className={cn('space-y-2 p-3', linked && 'bg-muted')}
    >
      <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', rule.isPaused && 'opacity-70')}>
        {category && <CategoryBadge icon={category.icon} color={category.color} />}
        <div className="min-w-24 flex-1">
          <h2 className="font-medium break-words">{title}</h2>
          <p data-testid="details" className="text-sm text-muted-foreground">
            {joinDetails([category?.name, account?.name, frequency])}
          </p>
          <p data-testid="next" className="text-sm text-muted-foreground">
            {nextText(rule, t, (date) => formatDate(date, locale))}
          </p>
          {rule.note && <p className="text-sm break-words text-muted-foreground">{rule.note}</p>}
        </div>
        <span data-testid="amount" className="font-medium tabular-nums">
          {/* The type gives the sign. Putting it in front of the digits is not arithmetic. */}
          <Money amount={signedAmount(rule.amount, type === 'expense')} currency={rule.currency} />
        </span>
        {!confirming && (
          <>
            <Button variant="outline" size="sm" aria-label={t('recurring.editNamed', { name: title })} onClick={onEdit}>
              {t('recurring.edit')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={toggle.isPending}
              aria-label={t(rule.isPaused ? 'recurring.resumeNamed' : 'recurring.pauseNamed', { name: title })}
              onClick={() => toggle.mutate(rule.id)}
            >
              {rule.isPaused ? t('recurring.resume') : t('recurring.pause')}
            </Button>
            <Button variant="ghost" size="sm" aria-label={t('recurring.deleteNamed', { name: title })} onClick={() => setConfirming(true)}>
              {t('recurring.delete')}
            </Button>
          </>
        )}
      </div>
      {confirming && (
        <div role="group" aria-label={t('recurring.deleteNamed', { name: title })} className="space-y-2 rounded-md bg-muted p-3">
          <p className="text-sm">{t('recurring.deleteExplained', { name: title })}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="destructive" size="sm" disabled={remove.isPending} onClick={() => remove.mutate(rule.id)}>
              {t('recurring.deleteConfirm')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
              {t('recurring.cancel')}
            </Button>
          </div>
        </div>
      )}
      <FailureToast
        failed={pause.isError || resume.isError}
        message={t('recurring.errors.notChanged')}
        retry={() => (pause.isError ? pause : resume).mutate(rule.id)}
        onDismiss={() => {
          pause.reset()
          resume.reset()
        }}
      />
      <FailureToast failed={remove.isError} message={t('recurring.errors.notDeleted')} retry={() => remove.mutate(rule.id)} onDismiss={remove.reset} />
    </li>
  )
}

/** When the rule next records: paused, on its next due date, or never again once it has ended. */
function nextText(rule: RecurringRule, t: ReturnType<typeof useTranslation>['t'], format: (date: string) => string) {
  if (rule.isPaused) return t('recurring.paused')
  if (rule.nextRunDate) return t('recurring.nextOn', { date: format(rule.nextRunDate) })
  return rule.endDate ? t('recurring.endedOn', { date: format(rule.endDate) }) : t('recurring.ended')
}


/** Rows standing in for the list while it loads. */
function ListSkeleton() {
  const { t } = useTranslation()
  return (
    <ul aria-busy aria-label={t('recurring.loading')} className="divide-y rounded-lg border">
      {[0, 1, 2].map((row) => (
        <li key={row} className="flex items-center gap-3 p-3">
          <span className="size-7 animate-pulse rounded-full bg-muted" />
          <span className="h-4 flex-1 animate-pulse rounded bg-muted" />
          <span className="h-4 w-20 animate-pulse rounded bg-muted" />
        </li>
      ))}
    </ul>
  )
}
