import { useQuery } from '@tanstack/react-query'
import type { ParseKeys } from 'i18next'
import { ChevronLeft, ChevronRight, CircleAlert, CircleCheck, TriangleAlert, type LucideIcon } from 'lucide-react'
import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { categoriesQuery, CategoryBadge, type Category } from '@/features/categories'
import { useUserSettings } from '@/features/settings'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { FailureToast } from '@/shared/components/FailureToast'
import { isStale } from '@/shared/api/versionedSave'
import { todayIn } from '@/shared/dates'
import { useLocale } from '@/shared/i18n/useLocale'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { cn, focusRing } from '@/shared/lib/utils'
import { amountExample, AmountInput, Money, type AmountValue, type Currency } from '@/shared/money'
import { Button } from '@/shared/ui/button'
import { budgetsQuery, useRemoveBudget, useSetBudget, type Budget, type BudgetState, type BudgetTotals } from '../api/budgets'
import { formatMonth, isBudgetMonth, shiftMonth, type BudgetMonth } from '../budgetMonth'

/** What a row needs of the category it is for: one from the user's tree, or the one a budget carries when it is archived. */
type RowCategory = Pick<Category, 'id' | 'parentId' | 'name' | 'icon' | 'color' | 'isArchived'>

/** Why a category takes no budget of its own this month: its spending is already counted by another one's budget (spec section 3, rule 6). */
type Blocked = { by: 'parent'; parentName: string } | { by: 'subcategories' }

type Row = { category: RowCategory; budget: Budget | undefined; blocked: Blocked | undefined; subcategories: Row[] }

/**
 * The budget screen: the budgets of one budget month against what was spent, with totals, a month switcher,
 * and each amount edited in place. Every figure and state comes from the API; nothing is added up here.
 */
export function BudgetsPage() {
  const { t } = useTranslation()
  const locale = useLocale()
  useDocumentTitle(t('screens.budgets'))
  const { timeZone } = useUserSettings()
  const { month: asked } = useParams()
  const thisMonth = todayIn(timeZone).slice(0, 7)
  const month = isBudgetMonth(asked) ? asked : thisMonth
  const budgets = useQuery(budgetsQuery(month))
  const categories = useQuery(categoriesQuery())
  const listId = useId()

  const monthName = formatMonth(month, locale)
  const rows = budgets.data && categories.data ? rowsFor(categories.data, budgets.data.items, new Intl.Collator(locale)) : undefined

  return (
    <section className="max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{t('screens.budgets')}</h1>
        <p className="text-muted-foreground">{t('budgets.intro')}</p>
      </div>

      <MonthSwitcher month={month} monthName={monthName} thisMonth={thisMonth} />

      {(budgets.isError || categories.isError) && <ErrorMessage>{t('budgets.errors.notLoaded')}</ErrorMessage>}

      {budgets.data && rows && (
        <>
          {budgets.data.items.length === 0 ? (
            <p className="text-muted-foreground">{t('budgets.empty')}</p>
          ) : (
            <Totals totals={budgets.data.totals} currency={budgets.data.currency} monthName={monthName} />
          )}

          <h3 id={listId} className="sr-only">
            {t('budgets.byCategory')}
          </h3>
          <ul aria-labelledby={listId} className="divide-y rounded-lg border">
            {rows.map((row) => (
              // A row starts again in another month: what was typed for November is not a draft for December.
              <BudgetRow key={`${month}/${row.category.id}`} row={row} month={month} currency={budgets.data.currency} />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/**
 * The user's expense categories as rows, by name, each top-level one with its subcategories, and each with the
 * budget it has this month. A budget on a category the tree no longer offers (an archived one) gets a row of its
 * own at the end, so no budget the totals count goes unseen.
 */
function rowsFor(categories: Category[], budgets: Budget[], collator: Intl.Collator): Row[] {
  const budgetOf = new Map(budgets.map((budget) => [budget.categoryId, budget]))
  const byName = (a: RowCategory, b: RowCategory) => collator.compare(a.name, b.name)
  const shown = new Set<string>()
  const row = (category: RowCategory, blocked: Blocked | undefined, subcategories: Row[] = []): Row => {
    shown.add(category.id)
    return { category, budget: budgetOf.get(category.id), blocked, subcategories }
  }

  const rows = categories
    .filter((category) => category.kind === 'expense')
    .toSorted(byName)
    .map((category) => {
      const parentIsBudgeted = budgetOf.has(category.id)
      const subcategoryIsBudgeted = category.subcategories.some((subcategory) => budgetOf.has(subcategory.id))
      return row(
        category,
        subcategoryIsBudgeted && !parentIsBudgeted ? { by: 'subcategories' } : undefined,
        category.subcategories.toSorted(byName).map((subcategory) => row(subcategory, parentIsBudgeted ? { by: 'parent', parentName: category.name } : undefined)),
      )
    })

  const unlisted = budgets
    .filter((budget) => !shown.has(budget.categoryId))
    .map((budget) => budget.category)
    .toSorted(byName)
    .map((category) => row(category, undefined))

  return [...rows, ...unlisted]
}

function MonthSwitcher({ month, monthName, thisMonth }: { month: BudgetMonth; monthName: string; thisMonth: BudgetMonth }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const previous = shiftMonth(month, -1)
  const next = shiftMonth(month, 1)
  const step = cn('inline-flex size-9 items-center justify-center rounded-md border hover:bg-muted', focusRing)

  return (
    <nav aria-label={t('budgets.month.switcher')} className="flex flex-wrap items-center gap-2">
      <Link className={step} to={`/budgets/${previous}`} aria-label={t('budgets.month.previous', { month: formatMonth(previous, locale) })}>
        <ChevronLeft aria-hidden className="size-4" />
      </Link>
      <h2 className="min-w-40 flex-1 text-center text-lg font-semibold sm:flex-none">
        {monthName}
      </h2>
      <Link className={step} to={`/budgets/${next}`} aria-label={t('budgets.month.next', { month: formatMonth(next, locale) })}>
        <ChevronRight aria-hidden className="size-4" />
      </Link>
      {month !== thisMonth && (
        <Link className={cn('rounded-md px-2 py-1 text-sm underline', focusRing)} to="/budgets">
          {t('budgets.month.current')}
        </Link>
      )}
    </nav>
  )
}

function Totals({ totals, currency, monthName }: { totals: BudgetTotals; currency: Currency; monthName: string }) {
  const { t } = useTranslation()

  return (
    <div role="group" aria-label={t('budgets.totals', { month: monthName })} className="space-y-2 rounded-lg border p-4">
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Figure label={t('budgets.budgeted')} amount={totals.budgeted} currency={currency} large />
        <Figure label={t('budgets.spent')} amount={totals.spent} currency={currency} large />
        <Figure label={t('budgets.remaining')} amount={totals.remaining} currency={currency} large />
      </dl>
      <NotConverted count={Number(totals.notConverted)} />
    </div>
  )
}

function Figure({ label, amount, currency, large = false }: { label: string; amount: string; currency: Currency; large?: boolean }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={cn('font-medium tabular-nums', large && 'text-lg')}>
        <Money amount={amount} currency={currency} />
      </dd>
    </div>
  )
}

/** The flag on a spent that leaves something out: how many expenses are not converted. Nothing when spent is complete. */
function NotConverted({ count }: { count: number }) {
  const { t } = useTranslation()
  if (count === 0) return null

  return (
    <p role="note" className="text-sm font-medium">
      {t('budgets.notConverted', { count })}
    </p>
  )
}

/** What the row says went wrong with the amount, as a translation key. */
type RowError = 'invalid' | 'category' | 'stale'

const errorMessages: Record<RowError, ParseKeys> = {
  invalid: 'budgets.errors.amount',
  category: 'budgets.errors.category',
  stale: 'budgets.errors.stale',
}

function BudgetRow({ row, month, currency, nested = false }: { row: Row; month: BudgetMonth; currency: Currency; nested?: boolean }) {
  const { category, budget, blocked, subcategories } = row
  const { t } = useTranslation()
  const locale = useLocale()
  const formId = useId()
  const errorId = useId()
  const set = useSetBudget(month)
  const remove = useRemoveBudget(month)

  // The amount as the user has it; it follows the saved budget whenever that changes (saved, removed, or
  // loaded again after it was changed somewhere else).
  const saved = budget?.budgeted ?? ''
  const [value, setValue] = useState<AmountValue>(saved)
  const [syncedWith, setSyncedWith] = useState(saved)
  const [error, setError] = useState<RowError | null>(null)
  if (syncedWith !== saved) {
    setSyncedWith(saved)
    setValue(saved)
  }

  const isDirty = value !== saved
  const isBusy = set.isPending || remove.isPending

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (value === null) return setError('invalid')
    setError(null)
    if (value === '') {
      if (budget) remove.mutate(category.id)
      return
    }

    const outcome = await set.mutateAsync({ categoryId: category.id, amount: value, rowVersion: budget?.rowVersion }).catch(() => undefined)
    if (!outcome || outcome.saved) return
    if (isStale(outcome)) return setError('stale')
    setError(outcome.fields.includes('amount') ? 'invalid' : 'category')
  }

  return (
    <li aria-label={category.name} className={nested ? 'pt-3' : 'p-3'}>
      <div className="space-y-2">
        {/* The amount wraps under a name it does not fit beside, so a phone never scrolls sideways. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <CategoryBadge icon={category.icon} color={category.color} />
          <span className="min-w-24 flex-1 break-words">{category.name}</span>
          {category.isArchived && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t('budgets.archived')}</span>}
          {budget && <StateBadge state={budget.state} />}
          {!blocked && (
            <form id={formId} noValidate onSubmit={save} className="flex flex-wrap items-center gap-2">
              <AmountInput
                className="w-36 text-right tabular-nums"
                aria-label={t('budgets.amountFor', { name: category.name })}
                aria-invalid={error === 'invalid' ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                placeholder={t('budgets.noBudget')}
                currency={currency}
                value={value}
                onChange={(next) => {
                  setValue(next)
                  setError(null)
                }}
              />
              {isDirty && (
                <Button type="submit" size="sm" disabled={isBusy} aria-label={t('budgets.saveFor', { name: category.name })}>
                  {t('budgets.save')}
                </Button>
              )}
              {budget && !isDirty && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isBusy}
                  aria-label={t('budgets.removeFor', { name: category.name })}
                  onClick={() => remove.mutate(category.id)}
                >
                  {t('budgets.remove')}
                </Button>
              )}
            </form>
          )}
        </div>

        {blocked && (
          <p className="text-sm text-muted-foreground">
            {blocked.by === 'parent' ? t('budgets.countsTowardParent', { name: blocked.parentName }) : t('budgets.subcategoriesBudgeted')}
          </p>
        )}
        {error && (
          <p id={errorId} role={error === 'stale' ? 'status' : 'alert'} className={cn('text-sm', error !== 'stale' && 'text-destructive')}>
            {t(errorMessages[error], { example: amountExample(locale, currency) })}
          </p>
        )}
        {budget && <Progress budget={budget} name={category.name} currency={currency} />}

        <FailureToast failed={set.isError} message={t('budgets.errors.notSaved')} retry={{ form: formId }} onDismiss={set.reset} />
        <FailureToast
          failed={remove.isError}
          message={t('budgets.errors.notRemoved')}
          retry={() => remove.mutate(category.id)}
          onDismiss={remove.reset}
        />
      </div>

      {subcategories.length > 0 && (
        <ul aria-label={t('budgets.subcategoriesOf', { name: category.name })} className="mt-3 space-y-3 divide-y pl-9">
          {subcategories.map((subcategory) => (
            <BudgetRow key={subcategory.category.id} row={subcategory} month={month} currency={currency} nested />
          ))}
        </ul>
      )}
    </li>
  )
}

/** How each state looks. The words and the icon's shape say it; colour only adds to them (spec section 8). */
const states: Record<BudgetState, { label: ParseKeys; icon: LucideIcon; badge: string; bar: string }> = {
  onTrack: { label: 'budgets.states.onTrack', icon: CircleCheck, badge: 'text-emerald-700 dark:text-emerald-400', bar: 'bg-emerald-600 dark:bg-emerald-500' },
  warning: { label: 'budgets.states.warning', icon: TriangleAlert, badge: 'text-amber-700 dark:text-amber-400', bar: 'bg-amber-500' },
  over: { label: 'budgets.states.over', icon: CircleAlert, badge: 'text-destructive', bar: 'bg-destructive' },
}

function StateBadge({ state }: { state: BudgetState }): ReactNode {
  const { t } = useTranslation()
  const { label, icon: Icon, badge } = states[state]

  return (
    <span className={cn('inline-flex items-center gap-1 text-sm font-medium', badge)}>
      <Icon aria-hidden className="size-4" />
      {t(label)}
    </span>
  )
}

/** Spent against the budget: a bar that fills up to the budget and no further, the percentage in figures, and what was spent and remains. */
function Progress({ budget, name, currency }: { budget: Budget; name: string; currency: Currency }) {
  const { t } = useTranslation()
  // A percentage is a count, not money. A budget of zero has none: its bar is full once anything is spent.
  const percent = budget.percentSpent === null ? null : Number(budget.percentSpent)
  const filled = percent === null ? (budget.state === 'over' ? 100 : 0) : Math.min(100, Math.max(0, percent))

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <div
          role="progressbar"
          aria-label={percent === null ? t('budgets.progressOfZero', { name }) : t('budgets.progress', { name, percent })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={filled}
          className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
        >
          <div className={cn('h-full rounded-full', states[budget.state].bar)} style={{ width: `${filled}%` }} />
        </div>
        {percent !== null && <span className="w-12 text-right text-sm tabular-nums text-muted-foreground">{t('budgets.percent', { percent })}</span>}
      </div>
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <Figure label={t('budgets.spent')} amount={budget.spent} currency={currency} />
        <Figure label={t('budgets.remaining')} amount={budget.remaining} currency={currency} />
      </dl>
      <NotConverted count={Number(budget.notConverted)} />
    </div>
  )
}
