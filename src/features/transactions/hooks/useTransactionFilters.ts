import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { decimalPattern } from '@/shared/money'
import { maxTagLength, tagName } from '../api/tags'
import { transactionTypes, transferLegTypes, type TransactionFilters } from '../api/transactions'

/** The filters, as the address and the API both name them. The sort order is not one: clearing the filters leaves it. */
const filterNames = ['from', 'to', 'accountId', 'categoryId', 'type', 'min', 'max', 'q', 'tag'] as const

/** What a filter or the sort order is changed to; undefined or empty takes it out of the address. */
export type ViewChanges = Partial<Record<(typeof filterNames)[number] | 'sort' | 'order', string>>

const calendarDate = /^\d{4}-\d{2}-\d{2}$/
/** As long a search as the API reads. */
export const maxSearchLength = 200

/**
 * The filters and sort order of the transaction list, kept in the address (spec section 12), so a view can be
 * bookmarked, shared and opened in another session. What the address holds that is not a filter the API can
 * read (a hand-edited date, a type that does not exist) is left out, as if it were not there.
 */
export function useTransactionFilters() {
  const [params, setParams] = useSearchParams()

  const view = useMemo(() => read(params), [params])
  // Two changes can come before the address has followed the first (a range of amounts, both ends typed
  // quickly): each is made on top of the one before, not on the address as it was last drawn.
  const latest = useRef(params)
  useEffect(() => {
    latest.current = params
  }, [params])
  const change = useCallback(
    (changes: ViewChanges) => {
      const next = new URLSearchParams(latest.current)
      for (const [name, value] of Object.entries(changes)) {
        if (value) next.set(name, value)
        else next.delete(name)
      }
      latest.current = next
      // A view is one screen, however many filters it took to get to: Back leaves the transactions.
      void setParams(next, { replace: true })
    },
    [setParams],
  )
  const clear = useCallback(() => change(Object.fromEntries(filterNames.map((name) => [name, undefined]))), [change])

  return { view, isFiltered: filterNames.some((name) => view[name] !== undefined), change, clear }
}

function read(params: URLSearchParams): TransactionFilters {
  const text = (name: string) => params.get(name) || undefined
  const matching = (name: string, pattern: RegExp) => {
    const value = text(name)
    return value !== undefined && pattern.test(value) ? value : undefined
  }
  const oneOf = <Value extends string>(name: string, values: readonly Value[]) => values.find((value) => value === params.get(name))
  const amount = (name: string) => {
    const value = matching(name, decimalPattern)
    return value?.startsWith('-') ? undefined : value
  }

  const view: TransactionFilters = {
    from: matching('from', calendarDate),
    to: matching('to', calendarDate),
    accountId: text('accountId'),
    categoryId: text('categoryId'),
    type: oneOf('type', [...transactionTypes, ...transferLegTypes]),
    min: amount('min'),
    max: amount('max'),
    q: text('q')?.trim().slice(0, maxSearchLength) || undefined,
    // As the API keeps a tag's name, so one typed into the address in another case is the same view.
    tag: [tagName(text('tag') ?? '')].find((name) => name !== '' && name.length <= maxTagLength),
    // The API's own order, newest date first, is the one the address leaves out.
    sort: oneOf('sort', ['amount']),
    order: oneOf('order', ['asc']),
  }
  // Only what is set: two addresses that mean the same view share one cached list.
  return Object.fromEntries(Object.entries(view).filter(([, value]) => value !== undefined))
}
