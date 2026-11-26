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

/** A line over the bars. Its values may stop short of the points, or be null, where it has none. */
export type ChartLine = Omit<ChartSeries, 'values'> & {
  values: (number | null)[]
  /** Drawn dashed: a line to compare with, not the one the chart is about. */
  dashed?: boolean
}

type Props = {
  /** What the chart shows, read out in place of the drawing. The numbers are in the table view. */
  label: string
  /** What each point is, along the bottom, in order. */
  points: string[]
  /** Drawn side by side as bars at each point. */
  bars: ChartSeries[]
  /** Each drawn as a line over the bars. */
  lines: ChartLine[]
  /** Writes a value in the tooltip, in full. */
  formatTooltip: (value: number) => string
  /** Writes a value on the side axis, short (`formatAxisAmount`). */
  formatAxis: (value: number) => string
  /** In pixels. */
  height?: number
}

/**
 * Grouped bars with a line over them (spec section 12, Charts): the one place the app draws one, over the charting
 * library, so the library can be swapped without touching a feature.
 */
export function BarsWithLineChart({ label, points, bars, lines, formatTooltip, formatAxis, height = 300 }: Props) {
  const data = points.map((point, index) => ({
    point,
    ...Object.fromEntries(bars.map((series) => [series.key, series.values[index] ?? 0])),
    ...Object.fromEntries(lines.map((series) => [series.key, series.values[index] ?? null])),
  }))

  return (
    <figure role="img" aria-label={label} className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 600, height }}>
        <ComposedChart data={data} accessibilityLayer={false}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
          <XAxis dataKey="point" />
          <YAxis tickFormatter={formatAxis} width={96} />
          <Tooltip
            formatter={(value) => formatTooltip(Number(value))}
            // In the theme's colours, so it reads in dark mode too.
            contentStyle={{ background: 'var(--color-popover)', borderColor: 'var(--color-border)', color: 'var(--color-popover-foreground)' }}
            cursor={{ className: 'fill-muted' }}
          />
          <Legend />
          {bars.map((series) => (
            <Bar key={series.key} dataKey={series.key} name={series.name} fill={series.color} isAnimationActive={false} />
          ))}
          {lines.map((series) => (
            <Line
              key={series.key}
              dataKey={series.key}
              name={series.name}
              stroke={series.color}
              strokeWidth={2}
              strokeDasharray={series.dashed ? '6 4' : undefined}
              isAnimationActive={false}
              connectNulls={false}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </figure>
  )
}
