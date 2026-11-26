import { Bar, BarChart as Chart, CartesianGrid, Legend, XAxis, YAxis } from 'recharts'

/** One set of bars: a value for each category down the side, drawn in its own colour and named in the legend. */
export type BarSeries = {
  key: string
  /** What the legend calls it, already translated. */
  name: string
  /** Numbers for drawing only, one per category. Amounts stay decimal strings everywhere else. */
  values: number[]
  color: string
}

type Props = {
  /** What the chart shows, read out in place of the drawing. The numbers are in the table view. */
  label: string
  /** What each row of bars is called, top to bottom. */
  categories: string[]
  series: BarSeries[]
  /** Writes a value on the axis along the bottom. */
  formatValue?: (value: number) => string
  width?: number
}

/** How tall each row of bars is, in pixels, so a long list stays readable. */
const rowHeight = 44

/**
 * A horizontal bar chart (spec section 12, Charts), over the charting library like `DonutChart`, so the library can
 * be swapped without touching a feature. Each category is a row with one bar for each series, side by side.
 */
export function BarChart({ label, categories, series, formatValue, width = 640 }: Props) {
  const data = categories.map((category, index) => ({ category, ...Object.fromEntries(series.map((bars) => [bars.key, bars.values[index] ?? 0])) }))
  const height = Math.max(160, categories.length * rowHeight + 64)

  return (
    <figure role="img" aria-label={label} className="max-w-full overflow-x-auto">
      <Chart layout="vertical" width={width} height={height} data={data} accessibilityLayer={false} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
        <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={formatValue} />
        <YAxis type="category" dataKey="category" tick={{ fontSize: 12 }} width={128} />
        <Legend />
        {series.map((bars) => (
          <Bar key={bars.key} dataKey={bars.key} name={bars.name} fill={bars.color} isAnimationActive={false} />
        ))}
      </Chart>
    </figure>
  )
}
