import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, XAxis, YAxis } from 'recharts'

/** One area, or the line drawn over them: a value at each point along the bottom, in its own colour. */
export type AreaSeries = {
  key: string
  /** What it is, in the legend, so its colour is never the only thing telling it apart. */
  name: string
  /** Numbers for drawing only, one per point. Amounts stay decimal strings everywhere else. */
  values: number[]
  color: string
}

type Props = {
  /** What the chart shows, read out in place of the drawing. The numbers are in the table view. */
  label: string
  /** What each point along the bottom is called, already written the locale's way. */
  points: string[]
  /** Stacked on each other: those above zero upwards from it, those below zero downwards. */
  areas: AreaSeries[]
  /** Drawn over the areas, not stacked: what they come to. */
  line?: AreaSeries
  /** Writes a value on the side axis. */
  formatValue?: (value: number) => string
  width?: number
  height?: number
}

/**
 * A stacked area chart (spec section 12, Charts), over the charting library like `LineChart`, so the library can
 * be swapped without touching a feature. Areas below zero stack downwards, so what is owed shows under the line.
 */
export function StackedAreaChart({ label, points, areas, line, formatValue, width = 640, height = 280 }: Props) {
  const all = line ? [...areas, line] : areas
  const data = points.map((point, index) => ({
    point,
    ...Object.fromEntries(all.map((each) => [each.key, each.values[index] ?? 0])),
  }))

  return (
    <figure role="img" aria-label={label} className="max-w-full overflow-x-auto">
      <ComposedChart
        width={width}
        height={height}
        data={data}
        stackOffset="sign"
        accessibilityLayer={false}
        margin={{ top: 8, right: 16, bottom: 8, left: 16 }}
      >
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="point" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} tickFormatter={formatValue} width={96} />
        <ReferenceLine y={0} className="stroke-border" />
        <Legend />
        {areas.map((area) => (
          <Area
            key={area.key}
            dataKey={area.key}
            name={area.name}
            stackId="areas"
            stroke={area.color}
            fill={area.color}
            fillOpacity={0.4}
            // An area over one point has no width, so a period with one month end shows it as a dot.
            dot={points.length === 1}
            isAnimationActive={false}
          />
        ))}
        {line && <Line dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={2} dot isAnimationActive={false} />}
      </ComposedChart>
    </figure>
  )
}
