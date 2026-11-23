import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Account } from '@/features/accounts'
import type { Category } from '@/features/categories'
import { SelectField } from '@/shared/components/SelectField'
import { TextField } from '@/shared/components/TextField'
import { useLocale } from '@/shared/i18n/useLocale'
import { amountExample, AmountInput, type AmountValue, type Currency } from '@/shared/money'
import { Button } from '@/shared/ui/button'
import { Label } from '@/shared/ui/label'
import { transactionTypes, type TransactionFilters } from '../api/transactions'
import { maxSearchLength, type ViewChanges } from '../hooks/useTransactionFilters'

type Props = {
  view: TransactionFilters
  isFiltered: boolean
  onChange: (changes: ViewChanges) => void
  onClear: () => void
  /** Archived ones too: transactions on them are still there to find. */
  accounts: Account[]
  categories: Category[]
  /** The currency amounts are typed in while no account is chosen. */
  fallbackCurrency: Currency
}

/** The four orders the list comes in, each as the sort and order the address holds for it: none for the API's own. */
const sortOrders = {
  dateDesc: { sort: undefined, order: undefined },
  dateAsc: { sort: undefined, order: 'asc' },
  amountDesc: { sort: 'amount', order: undefined },
  amountAsc: { sort: 'amount', order: 'asc' },
} as const
type SortOrder = keyof typeof sortOrders

/**
 * The filters and sort order of the transaction list (spec TXN-2, TXN-3). It shows what the address holds and
 * changes it; the list follows the address. A choice applies at once, something typed once the typing pauses.
 */
export function TransactionFilterBar({ view, isFiltered, onChange, onClear, accounts, categories, fallbackCurrency }: Props) {
  const { t } = useTranslation()
  // An account's amounts are in its currency, so that decides the decimals a range can be typed with.
  const currency = accounts.find((account) => account.id === view.accountId)?.currency ?? fallbackCurrency
  const [search, setSearch] = useTyped<string>(view.q ?? '', (q) => onChange({ q }), (text) => text.trim())
  const sortOrder = (Object.keys(sortOrders) as SortOrder[]).find(
    (name) => sortOrders[name].sort === view.sort && sortOrders[name].order === view.order,
  )

  return (
    <form role="search" aria-label={t('transactions.filters.title')} className="grid grid-cols-2 gap-3 sm:grid-cols-4" onSubmit={(event) => event.preventDefault()}>
      <div className="col-span-2 sm:col-span-4">
        <TextField
          type="search"
          label={t('transactions.filters.search')}
          maxLength={maxSearchLength}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <TextField type="date" label={t('transactions.filters.from')} value={view.from ?? ''} max={view.to} onChange={(event) => onChange({ from: event.target.value })} />
      <TextField type="date" label={t('transactions.filters.to')} value={view.to ?? ''} min={view.from} onChange={(event) => onChange({ to: event.target.value })} />
      <AmountFilter label={t('transactions.filters.min')} amount={view.min} currency={currency} onChange={(min) => onChange({ min })} />
      <AmountFilter label={t('transactions.filters.max')} amount={view.max} currency={currency} onChange={(max) => onChange({ max })} />
      <SelectField
        label={t('transactions.account')}
        value={view.accountId ?? ''}
        onChange={(event) => onChange({ accountId: event.target.value })}
        options={[{ value: '', label: t('transactions.filters.allAccounts') }, ...accounts.map((account) => ({ value: account.id, label: account.name }))]}
      />
      <SelectField
        label={t('transactions.category')}
        value={view.categoryId ?? ''}
        onChange={(event) => onChange({ categoryId: event.target.value })}
        options={[
          { value: '', label: t('transactions.filters.allCategories') },
          ...categories.flatMap((category) => [
            { value: category.id, label: category.name },
            ...category.subcategories.map((subcategory) => ({
              value: subcategory.id,
              label: t('transactions.subcategory', { parent: category.name, name: subcategory.name }),
            })),
          ]),
        ]}
      />
      <SelectField
        label={t('transactions.type')}
        value={view.type ?? ''}
        onChange={(event) => onChange({ type: event.target.value })}
        options={[{ value: '', label: t('transactions.filters.allTypes') }, ...transactionTypes.map((type) => ({ value: type, label: t(`transactions.types.${type}`) }))]}
      />
      <SelectField
        label={t('transactions.filters.sortBy')}
        value={sortOrder}
        onChange={(event) => onChange(sortOrders[event.target.value as SortOrder])}
        options={(Object.keys(sortOrders) as SortOrder[]).map((name) => ({ value: name, label: t(`transactions.filters.sort.${name}`) }))}
      />
      {isFiltered && (
        <div className="col-span-2 sm:col-span-4">
          <Button type="button" variant="outline" size="sm" onClick={onClear}>
            {t('transactions.filters.clear')}
          </Button>
        </div>
      )}
    </form>
  )
}

type AmountFilterProps = { label: string; amount: string | undefined; currency: Currency; onChange: (amount: string) => void }

/** One end of the range of amounts, typed with the locale's separators. Text that is not an amount says so and filters nothing. */
function AmountFilter({ label, amount, currency, onChange }: AmountFilterProps) {
  const { t } = useTranslation()
  const locale = useLocale()
  const id = useId()
  const [typed, setTyped] = useTyped<AmountValue>(amount ?? '', onChange, (value) => value ?? '')
  const invalid = typed === null
  const errorId = `${id}-error`

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <AmountInput id={id} value={typed} onChange={setTyped} currency={currency} aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined} />
      {invalid && (
        <p id={errorId} className="text-sm text-destructive">
          {t('transactions.errors.amountInvalid', { example: amountExample(locale, currency) })}
        </p>
      )}
    </div>
  )
}

/** How long the typing must pause before what was typed becomes a filter. */
const typingPause = 300

/**
 * What the user is typing into a filter, made the filter once the typing pauses, so the list is not asked for
 * again at every key. It follows the filter when that changes anywhere else: cleared, or another address opened.
 *
 * @param asFilter What the text typed so far filters by: a search without the spaces around it, nothing for text that is not an amount.
 */
function useTyped<Typed extends string | null>(filter: string, onPause: (filter: string) => void, asFilter: (typed: Typed) => string) {
  const [typed, setTyped] = useState(filter as Typed)
  const [followed, setFollowed] = useState(filter)
  if (followed !== filter) {
    setFollowed(filter)
    if (asFilter(typed) !== filter) setTyped(filter as Typed)
  }

  const waiting = asFilter(typed)
  useEffect(() => {
    if (waiting === filter) return undefined
    const pause = setTimeout(() => onPause(waiting), typingPause)
    return () => clearTimeout(pause)
    // Only the filter and what is waiting to become it restart the wait; `onPause` is new at every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, filter])

  return [typed, setTyped] as const
}
