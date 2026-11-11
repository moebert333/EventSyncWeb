import { useState, type MouseEvent, type ReactNode } from 'react'

type Series = { name: string; data: number[]; color: string }

type TipLine = { label: string; value: string; color?: string }
type TipState = { x: number; y: number; title?: string; lines: TipLine[] }

function formatValue(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return Number.isInteger(value) || Math.abs(value - Math.round(value)) < 0.05
    ? String(Math.round(value))
    : value.toFixed(1)
}

function ChartTooltip({ tip }: { tip: TipState | null }) {
  if (!tip) return null
  return (
    <div
      className="pointer-events-none absolute z-20 max-w-[220px] rounded border border-white/15 bg-zinc-950/95 px-2.5 py-1.5 text-xs text-zinc-100 shadow-lg"
      style={{
        left: tip.x,
        top: tip.y,
        transform: 'translate(-50%, calc(-100% - 10px))',
      }}
    >
      {tip.title ? <p className="mb-1 font-semibold text-zinc-200">{tip.title}</p> : null}
      <ul className="space-y-0.5">
        {tip.lines.map((line) => (
          <li key={line.label} className="flex items-center gap-1.5">
            {line.color ? (
              <span className="inline-block h-2 w-2 shrink-0" style={{ background: line.color }} />
            ) : null}
            <span className="text-zinc-400">{line.label}:</span>
            <span className="font-medium text-zinc-100">{line.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ChartShell({
  className,
  children,
  tip,
  setTip,
}: {
  className?: string
  children: ReactNode
  tip: TipState | null
  setTip: (tip: TipState | null) => void
}) {
  return (
    <div
      className={`relative ${className ?? ''}`}
      onMouseLeave={() => setTip(null)}
    >
      {children}
      <ChartTooltip tip={tip} />
    </div>
  )
}

function tipFromEvent(
  event: MouseEvent,
  shell: HTMLElement | null,
  payload: Omit<TipState, 'x' | 'y'>,
): TipState {
  const rect = shell?.getBoundingClientRect()
  return {
    ...payload,
    x: rect ? event.clientX - rect.left : event.nativeEvent.offsetX,
    y: rect ? event.clientY - rect.top : event.nativeEvent.offsetY,
  }
}

type LineChartProps = {
  categories: string[]
  series: Series[]
  height?: number
  yMin?: number
  yMax?: number
  invertY?: boolean
  reference?: { value: number; label: string }
  /** Hide the reference value label drawn on the plot (legend can cover it). */
  hideReferenceLabel?: boolean
  className?: string
}

/** Pick category indexes to label so value text roughly fits without overlapping. */
function pointLabelIndexes(count: number, bandW: number, sampleLabel = '10'): number[] {
  if (count <= 0) return []
  if (count === 1) return [0]
  const labelW = Math.max(18, sampleLabel.length * 8)
  const stride = Math.max(1, Math.ceil((labelW + 6) / Math.max(bandW, 1)))
  const indexes: number[] = []
  for (let i = 0; i < count; i += stride) indexes.push(i)
  const last = count - 1
  if (indexes[indexes.length - 1] !== last) {
    if (indexes.length > 0 && last - indexes[indexes.length - 1]! < stride) {
      indexes.pop()
    }
    indexes.push(last)
  }
  return indexes
}

export function SimpleLineChart({
  categories,
  series,
  height = 180,
  yMin,
  yMax,
  invertY = false,
  reference,
  hideReferenceLabel = false,
  className = 'h-auto w-full',
}: LineChartProps) {
  const [tip, setTip] = useState<TipState | null>(null)
  const [shell, setShell] = useState<HTMLDivElement | null>(null)
  const width = 420
  const pad = { top: 20, right: 14, bottom: 34, left: 40 }
  const all = series.flatMap((item) => item.data.filter((n) => Number.isFinite(n) && n > 0))
  const min = yMin ?? (all.length ? Math.min(...all) : 0)
  const max = yMax ?? (all.length ? Math.max(...all) : 1)
  const span = Math.max(0.001, max - min)
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const bandW = categories.length <= 1 ? innerW : innerW / (categories.length - 1)
  const labelFill = '#f4f4f5'
  const sampleLabel = formatValue(all.length ? Math.max(...all) : 10)
  const labeled = new Set(pointLabelIndexes(categories.length, bandW, sampleLabel))
  const labeledCategories = new Set(pointLabelIndexes(categories.length, bandW, 'Rd 99'))

  function xAt(index: number) {
    if (categories.length <= 1) return pad.left + innerW / 2
    return pad.left + (index / (categories.length - 1)) * innerW
  }

  function yAt(value: number) {
    const t = (value - min) / span
    const y = invertY ? t : 1 - t
    return pad.top + y * innerH
  }

  function showCategoryTip(event: MouseEvent, index: number) {
    const lines: TipLine[] = series
      .map((item) => {
        const value = item.data[index]
        if (!Number.isFinite(value) || (value as number) <= 0) return null
        return { label: item.name, value: formatValue(value as number), color: item.color }
      })
      .filter((line): line is TipLine => line != null)
    if (reference != null) {
      lines.push({
        label: reference.label,
        value: formatValue(reference.value),
        color: '#4ade80',
      })
    }
    if (lines.length === 0) {
      setTip(null)
      return
    }
    setTip(
      tipFromEvent(event, shell, {
        title: categories[index] ?? `Point ${index + 1}`,
        lines,
      }),
    )
  }

  return (
    <ChartShell className="h-full w-full" tip={tip} setTip={setTip}>
      <div ref={setShell} className="h-full w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className={className}
          role="img"
        >
          {[0, 0.5, 1].map((t) => {
            const y = pad.top + t * innerH
            return (
              <line
                key={t}
                x1={pad.left}
                x2={width - pad.right}
                y1={y}
                y2={y}
                stroke="rgb(255 255 255 / 0.08)"
              />
            )
          })}
          {reference != null ? (
            <g>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={yAt(reference.value)}
                y2={yAt(reference.value)}
                stroke="#4ade80"
                strokeDasharray="4 4"
              />
              {!hideReferenceLabel ? (
                <text
                  x={width - pad.right}
                  y={yAt(reference.value) - 4}
                  textAnchor="end"
                  fill="#4ade80"
                  fontSize="14"
                  fontWeight="600"
                >
                  {reference.label}
                </text>
              ) : null}
            </g>
          ) : null}
          {series.map((item, seriesIndex) => {
            const points = item.data
              .map((value, index) => {
                if (!Number.isFinite(value) || value <= 0) return null
                return `${xAt(index)},${yAt(value)}`
              })
              .filter(Boolean)
              .join(' ')
            const labelDy = series.length > 1 && seriesIndex % 2 === 1 ? 14 : -8
            return (
              <g key={item.name}>
                <polyline fill="none" stroke={item.color} strokeWidth="2.5" points={points} />
                {item.data.map((value, index) =>
                  Number.isFinite(value) && value > 0 ? (
                    <g key={`${item.name}-${index}`}>
                      <circle cx={xAt(index)} cy={yAt(value)} r="3.5" fill={item.color} />
                      {labeled.has(index) ? (
                        <text
                          x={xAt(index)}
                          y={yAt(value) + labelDy}
                          textAnchor="middle"
                          fill={item.color}
                          fontSize="13"
                          fontWeight="700"
                        >
                          {formatValue(value)}
                        </text>
                      ) : null}
                    </g>
                  ) : null,
                )}
              </g>
            )
          })}
          {categories.map((label, index) =>
            labeledCategories.has(index) ? (
              <text
                key={label + index}
                x={xAt(index)}
                y={height - 10}
                textAnchor="middle"
                fill={labelFill}
                fontSize="14"
                fontWeight="600"
              >
                {label}
              </text>
            ) : null,
          )}
          <text x={4} y={pad.top + 6} fill={labelFill} fontSize="14" fontWeight="600">
            {/* invertY: better (lower) places plot toward the top */}
            {formatValue(invertY ? min : max)}
          </text>
          <text x={4} y={height - pad.bottom} fill={labelFill} fontSize="14" fontWeight="600">
            {formatValue(invertY ? max : min)}
          </text>
          {categories.map((_, index) => {
            const x = xAt(index) - bandW / 2
            return (
              <rect
                key={`hit-${index}`}
                x={x}
                y={pad.top}
                width={Math.max(bandW, 24)}
                height={innerH}
                fill="transparent"
                className="cursor-crosshair"
                onMouseEnter={(event) => showCategoryTip(event, index)}
                onMouseMove={(event) => showCategoryTip(event, index)}
              />
            )
          })}
        </svg>
      </div>
    </ChartShell>
  )
}

type BarChartProps = {
  categories: string[]
  values: number[]
  color?: string
  /** Optional per-bar colors; falls back to `color` / cycling defaults. */
  colors?: string[]
  height?: number
  horizontal?: boolean
  /** Draw min/max labels on the vertical axis (vertical bars only). */
  showYAxis?: boolean
  /** Draw category labels vertically inside each bar. */
  verticalLabels?: boolean
  className?: string
}

export function SimpleBarChart({
  categories,
  values,
  color = '#f5c518',
  colors,
  height = 240,
  horizontal = false,
  showYAxis = false,
  verticalLabels = false,
  className = 'h-auto w-full',
}: BarChartProps) {
  const [tip, setTip] = useState<TipState | null>(null)
  const [shell, setShell] = useState<HTMLDivElement | null>(null)
  const width = 420
  const pad = {
    top: 8,
    right: 12,
    bottom: horizontal ? 14 : verticalLabels ? 16 : 34,
    left: horizontal ? 84 : showYAxis ? 40 : 28,
  }
  const max = Math.max(1, ...values)
  const innerW = width - pad.left - pad.right
  const chartHeight = horizontal
    ? Math.max(height, categories.length * 40 + pad.top + pad.bottom)
    : height
  const innerH = chartHeight - pad.top - pad.bottom
  const fillPanel = className.includes('h-full')
  // Keep aspect for in-bar vertical labels so glyphs aren't squashed/clipped by stretch.
  const aspect = fillPanel ? (verticalLabels ? 'xMidYMid meet' : 'none') : undefined
  const labelFill = '#f4f4f5'
  const valueFill = '#ffffff'

  function barColor(index: number): string {
    if (colors?.length) return colors[index % colors.length]!
    return color
  }

  function showBarTip(event: MouseEvent, label: string, value: number, fill: string) {
    setTip(
      tipFromEvent(event, shell, {
        lines: [{ label, value: formatValue(value), color: fill }],
      }),
    )
  }

  if (horizontal) {
    const rowH = innerH / Math.max(1, categories.length)
    return (
      <ChartShell className={fillPanel ? 'h-full w-full' : undefined} tip={tip} setTip={setTip}>
        <div ref={setShell} className={fillPanel ? 'h-full w-full' : undefined}>
          <svg
            viewBox={`0 0 ${width} ${chartHeight}`}
            preserveAspectRatio={aspect}
            className={className}
            role="img"
          >
            {categories.map((label, index) => {
              const value = values[index] ?? 0
              const fill = barColor(index)
              const barW = (value / max) * innerW
              const y = pad.top + index * rowH + rowH * 0.15
              return (
                <g key={label}>
                  <text
                    x={pad.left - 8}
                    y={y + rowH * 0.45}
                    textAnchor="end"
                    fill={labelFill}
                    fontSize="14"
                    fontWeight="600"
                  >
                    {label}
                  </text>
                  <rect
                    x={pad.left}
                    y={y}
                    width={Math.max(0, barW)}
                    height={rowH * 0.55}
                    fill={fill}
                    className="cursor-pointer"
                    onMouseEnter={(event) => showBarTip(event, label, value, fill)}
                    onMouseMove={(event) => showBarTip(event, label, value, fill)}
                  />
                  <text
                    x={pad.left + barW + 6}
                    y={y + rowH * 0.45}
                    fill={valueFill}
                    fontSize="14"
                    fontWeight="600"
                  >
                    {formatValue(value)}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
      </ChartShell>
    )
  }

  const gap = 8
  const barW = (innerW - gap * (categories.length - 1)) / Math.max(1, categories.length)
  return (
    <ChartShell className={fillPanel ? 'h-full w-full' : undefined} tip={tip} setTip={setTip}>
      <div ref={setShell} className={fillPanel ? 'h-full w-full' : undefined}>
        <svg
          viewBox={`0 0 ${width} ${chartHeight}`}
          preserveAspectRatio={aspect}
          className={className}
          role="img"
        >
          {showYAxis
            ? [0, 0.5, 1].map((t) => {
                const y = pad.top + t * innerH
                return (
                  <line
                    key={t}
                    x1={pad.left}
                    x2={width - pad.right}
                    y1={y}
                    y2={y}
                    stroke="rgb(255 255 255 / 0.08)"
                  />
                )
              })
            : null}
          {categories.map((label, index) => {
            const value = values[index] ?? 0
            const fill = barColor(index)
            const barH = Math.max(0, (value / max) * innerH)
            const x = pad.left + index * (barW + gap)
            const y = pad.top + innerH - barH
            const labelX = x + barW / 2
            if (verticalLabels) {
              // Read upward from near the bar baseline; no clipPath so full names use the bar height.
              const fontSize = Math.min(16, Math.max(13, barW * 0.78))
              // ~2 character widths above the baseline (SVG collapses leading spaces).
              const labelY = pad.top + innerH - 3 - fontSize
              return (
                <g key={`${label}-${index}`}>
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={barH}
                    fill={fill}
                    className="cursor-pointer"
                    onMouseEnter={(event) => showBarTip(event, label, value, fill)}
                    onMouseMove={(event) => showBarTip(event, label, value, fill)}
                  />
                  {barH > 12 ? (
                    <text
                      x={labelX}
                      y={labelY}
                      textAnchor="start"
                      dominantBaseline="middle"
                      transform={`rotate(-90 ${labelX} ${labelY})`}
                      fill="#0a0a0a"
                      fontSize={fontSize}
                      fontWeight="700"
                      className="pointer-events-none"
                    >
                      {label}
                    </text>
                  ) : null}
                </g>
              )
            }
            return (
              <g key={`${label}-${index}`}>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={barH}
                  fill={fill}
                  className="cursor-pointer"
                  onMouseEnter={(event) => showBarTip(event, label, value, fill)}
                  onMouseMove={(event) => showBarTip(event, label, value, fill)}
                />
                <text
                  x={labelX}
                  y={chartHeight - 10}
                  textAnchor="middle"
                  fill={labelFill}
                  fontSize="14"
                  fontWeight="600"
                >
                  {label}
                </text>
              </g>
            )
          })}
          {showYAxis ? (
            <>
              <text x={4} y={pad.top + 6} fill={labelFill} fontSize="14" fontWeight="600">
                {formatValue(max)}
              </text>
              <text x={4} y={pad.top + innerH * 0.5 + 4} fill={labelFill} fontSize="14" fontWeight="600">
                {formatValue(max / 2)}
              </text>
              <text x={4} y={pad.top + innerH} fill={labelFill} fontSize="14" fontWeight="600">
                0
              </text>
            </>
          ) : null}
        </svg>
      </div>
    </ChartShell>
  )
}

type PieSlice = { label: string; value: number; color: string }

export function SimplePieChart({ data, size = 188 }: { data: PieSlice[]; size?: number }) {
  const [tip, setTip] = useState<TipState | null>(null)
  const [shell, setShell] = useState<HTMLDivElement | null>(null)
  const total = data.reduce((sum, slice) => sum + slice.value, 0)
  if (total <= 0) {
    return <p className="text-sm text-zinc-500">No Results</p>
  }
  const r = size / 2 - 4
  const cx = size / 2
  const cy = size / 2
  const active = data.filter((slice) => slice.value > 0)
  // Full-circle arcs are unreliable in SVG — draw a solid circle for a single slice.
  const solid = active.length === 1 ? active[0]! : null
  const paths = solid
    ? []
    : active.reduce<
        { label: string; value: number; color: string; d: string; endAngle: number }[]
      >((acc, slice) => {
        const start = acc.length ? acc[acc.length - 1]!.endAngle : -Math.PI / 2
        const sweep = (slice.value / total) * Math.PI * 2
        const end = start + sweep
        const x1 = cx + r * Math.cos(start)
        const y1 = cy + r * Math.sin(start)
        const x2 = cx + r * Math.cos(end)
        const y2 = cy + r * Math.sin(end)
        const large = sweep > Math.PI ? 1 : 0
        acc.push({
          ...slice,
          endAngle: end,
          d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`,
        })
        return acc
      }, [])

  function showSliceTip(event: MouseEvent, slice: PieSlice) {
    const pct = total > 0 ? ((slice.value / total) * 100).toFixed(0) : '0'
    setTip(
      tipFromEvent(event, shell, {
        lines: [
          {
            label: slice.label,
            value: `${formatValue(slice.value)} (${pct}%)`,
            color: slice.color,
          },
        ],
      }),
    )
  }

  return (
    <ChartShell className="flex h-full min-h-0 w-full flex-1 flex-col" tip={tip} setTip={setTip}>
      <div
        ref={setShell}
        className="flex h-full min-h-0 w-full flex-1 flex-col items-center gap-3"
      >
        <div className="flex min-h-0 w-full flex-1 items-center justify-center">
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="aspect-square max-h-[90%] max-w-[90%]"
            role="img"
          >
            {solid ? (
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill={solid.color}
                className="cursor-pointer"
                onMouseEnter={(event) => showSliceTip(event, solid)}
                onMouseMove={(event) => showSliceTip(event, solid)}
              />
            ) : null}
            {paths.map((slice) => (
              <path
                key={slice.label}
                d={slice.d}
                fill={slice.color}
                stroke="#18181b"
                strokeWidth={1.5}
                className="cursor-pointer"
                onMouseEnter={(event) => showSliceTip(event, slice)}
                onMouseMove={(event) => showSliceTip(event, slice)}
              />
            ))}
          </svg>
        </div>
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-zinc-300">
          {data
            .filter((slice) => slice.value > 0)
            .map((slice) => (
              <li key={slice.label} className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5" style={{ background: slice.color }} />
                {slice.label}: {slice.value}
              </li>
            ))}
        </ul>
      </div>
    </ChartShell>
  )
}
