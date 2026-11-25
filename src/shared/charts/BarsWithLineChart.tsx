import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

/** One series of the chart: a number per point, for drawing only. Amounts stay decimal strings everywhere else. */
export type ChartSeries = {
  key: string
  /** Already translated: names it in the legend and the tooltip. */
  name: string
  /** A CSS colour. */
  color: string
  values: number[]
}

type Props = {
  /** What the chart shows, read out in place of the drawing. The numbers are in the table view. */
  label: string
  /** What each point is, along the bottom, in order. */
  points: string[]
  /** Drawn side by side as bars at each point. */
  bars: ChartSeries[]
  /** Drawn as a line over the bars. */
  line: ChartSeries
  /** Writes a value in the tooltip, in full. */
  formatValue: (value: number) => string
  /** Writes a value on the side axis, short (`formatAxisAmount`). */
  formatAxis: (value: number) => string
  /** In pixels. */
  height?: number
}

/**
 * Grouped bars with a line over them (spec section 12, Charts): the one place the app draws one, over the charting
 * library, so the library can be swapped without touching a feature.
 */
export function BarsWithLineChart({ label, points, bars, line, formatValue, formatAxis, height = 300 }: Props) {
  const data = points.map((point, index) => ({
    point,
    ...Object.fromEntries([...bars, line].map((series) => [series.key, series.values[index] ?? 0])),
  }))

  return (
    <figure role="img" aria-label={label} className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 600, height }}>
        <ComposedChart data={data} accessibilityLayer={false}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="point" />
          <YAxis tickFormatter={formatAxis} width={96} />
          <Tooltip formatter={(value) => formatValue(Number(value))} />
          <Legend />
          {bars.map((series) => (
            <Bar key={series.key} dataKey={series.key} name={series.name} fill={series.color} isAnimationActive={false} />
          ))}
          <Line dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={2} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </figure>
  )
}
