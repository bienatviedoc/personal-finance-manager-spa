import { Cell, Pie, PieChart } from 'recharts'

/** One part of a donut: a share of the whole, drawn in its own colour. */
export type DonutSlice = {
  /** Says which slice was chosen. */
  key: string
  /** A number for drawing only: what the slice is worth against the others. Amounts stay decimal strings everywhere else. */
  value: number
  /** As `#rrggbb`. */
  color: string
}

type Props = {
  /** What the chart shows, read out in place of the drawing. The numbers are in the table view and the legend beside it. */
  label: string
  slices: DonutSlice[]
  /** A slice was clicked. A pointer alone can do it, so whatever the slice stands for must be choosable some other way too. */
  onSelect?: (key: string) => void
  /** Width and height, in pixels. */
  size?: number
}

/**
 * A donut chart (spec section 12, Charts): the one place the app draws one, over the charting library, so the
 * library can be swapped without touching a feature. Only slices worth more than nothing are drawn: a donut has
 * no way to show a part below zero.
 */
export function DonutChart({ label, slices, onSelect, size = 240 }: Props) {
  const drawn = slices.filter((slice) => slice.value > 0)

  return (
    <figure role="img" aria-label={label} className="mx-auto" style={{ width: size, height: size }}>
      <PieChart width={size} height={size} accessibilityLayer={false}>
        <Pie
          data={drawn}
          dataKey="value"
          nameKey="key"
          innerRadius="60%"
          outerRadius="100%"
          paddingAngle={drawn.length > 1 ? 1 : 0}
          stroke="none"
          isAnimationActive={false}
          onClick={onSelect ? (slice: { payload?: DonutSlice }) => slice.payload && onSelect(slice.payload.key) : undefined}
          className={onSelect ? 'cursor-pointer' : undefined}
        >
          {drawn.map((slice) => (
            <Cell key={slice.key} fill={slice.color} />
          ))}
        </Pie>
      </PieChart>
    </figure>
  )
}
