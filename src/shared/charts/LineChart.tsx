import { CartesianGrid, Line, LineChart as Chart, XAxis, YAxis } from 'recharts'

/** One line: a value at each point along the bottom, drawn in its own colour. */
export type LineSeries = {
  key: string
  /** Numbers for drawing only, one per point; null leaves a gap. Amounts stay decimal strings everywhere else. */
  values: (number | null)[]
  color: string
  /** Drawn dashed: a line to compare with, not the one the chart is about. */
  dashed?: boolean
}

type Props = {
  /** What the chart shows, read out in place of the drawing. The numbers are in the table view. */
  label: string
  /** What each point along the bottom is called, already written the locale's way. */
  points: string[]
  series: LineSeries[]
  /** Writes a value on the side axis. */
  formatValue?: (value: number) => string
  width?: number
  height?: number
}

/**
 * A line chart (spec section 12, Charts), over the charting library like `DonutChart`, so the library can be
 * swapped without touching a feature. Each series is a line over the same points.
 */
export function LineChart({ label, points, series, formatValue, width = 640, height = 280 }: Props) {
  const data = points.map((point, index) => ({ point, ...Object.fromEntries(series.map((line) => [line.key, line.values[index] ?? null])) }))

  return (
    <figure role="img" aria-label={label} className="max-w-full overflow-x-auto">
      <Chart width={width} height={height} data={data} accessibilityLayer={false} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="point" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} tickFormatter={formatValue} width={96} />
        {series.map((line) => (
          <Line
            key={line.key}
            dataKey={line.key}
            stroke={line.color}
            strokeWidth={2}
            strokeDasharray={line.dashed ? '6 4' : undefined}
            dot
            isAnimationActive={false}
            connectNulls={false}
          />
        ))}
      </Chart>
    </figure>
  )
}
