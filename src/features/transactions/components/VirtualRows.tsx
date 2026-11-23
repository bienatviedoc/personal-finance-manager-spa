import { measureElement, useWindowVirtualizer } from '@tanstack/react-virtual'
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'

/** What a row must put on its `<li>` to be placed and measured: spread it there. */
export type VirtualRow = { ref: (row: HTMLLIElement | null) => void; 'data-index': number; style: CSSProperties }

type Props<Item> = {
  items: Item[]
  itemKey: (item: Item) => string
  label: string
  /** The last row has come near the screen: the time to load what follows it. */
  onEndReached: () => void
  children: (item: Item, row: VirtualRow) => ReactNode
}

/** How tall a row is taken to be until it has been drawn and measured. */
const estimatedRowHeight = 72

/**
 * A list that keeps only the rows near the screen in the page (spec section 8): a user has thousands of
 * transactions, and the page scrolls as smoothly through them as through fifty. The page itself scrolls, not
 * the list. Rows are as tall as their content, measured once drawn; the list is as tall as all of them.
 *
 * jsdom lays nothing out: in a test a row is as tall as the estimate, and the pretend screen (`src/test/setup.ts`)
 * is tall enough for every row, so all of them are drawn. A test of the virtualisation itself gives the
 * screen and the rows a height (see `transactionList.test.tsx`).
 */
export function VirtualRows<Item>({ items, itemKey, label, onEndReached, children }: Props<Item>) {
  // Where the list starts in the page, which the rows' positions are counted from: read as the list is put
  // in the page, which is each time a view has loaded.
  const [scrollMargin, setScrollMargin] = useState(0)
  const placed = useCallback((list: HTMLUListElement | null) => {
    if (list) setScrollMargin(Math.round(list.getBoundingClientRect().top + window.scrollY))
  }, [])
  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => estimatedRowHeight,
    getItemKey: (index) => itemKey(items[index]!),
    // A row not laid out yet measures nothing: it keeps its estimate, or every row after it would move up under it.
    measureElement: (row, resized, instance) => measureElement(row, resized, instance) || estimatedRowHeight,
    overscan: 5,
    scrollMargin,
  })
  const rows = virtualizer.getVirtualItems()

  const lastDrawn = rows.at(-1)?.index
  const endReached = lastDrawn !== undefined && lastDrawn >= items.length - 1
  useEffect(() => {
    if (endReached) onEndReached()
  }, [endReached, onEndReached])

  return (
    <ul ref={placed} aria-label={label} className="relative rounded-lg border" style={{ height: virtualizer.getTotalSize() }}>
      {rows.map((row) =>
        children(items[row.index]!, { ref: virtualizer.measureElement, 'data-index': row.index, style: placedAt(row.start - scrollMargin) }),
      )}
    </ul>
  )
}

/** A row taken out of the flow and moved to where the list has it. */
const placedAt = (top: number): CSSProperties => ({ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${top}px)` })
