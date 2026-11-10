type Series = { name: string; data: number[]; color: string }

type LineChartProps = {
  categories: string[]
  series: Series[]
  height?: number
  yMin?: number
  yMax?: number
  invertY?: boolean
  reference?: { value: number; label: string }
}

export function SimpleLineChart({
  categories,
  series,
  height = 180,
  yMin,
  yMax,
  invertY = false,
  reference,
}: LineChartProps) {
  const width = 420
  const pad = { top: 12, right: 12, bottom: 28, left: 32 }
  const all = series.flatMap((item) => item.data.filter((n) => Number.isFinite(n) && n > 0))
  const min = yMin ?? (all.length ? Math.min(...all) : 0)
  const max = yMax ?? (all.length ? Math.max(...all) : 1)
  const span = Math.max(0.001, max - min)
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom

  function xAt(index: number) {
    if (categories.length <= 1) return pad.left + innerW / 2
    return pad.left + (index / (categories.length - 1)) * innerW
  }

  function yAt(value: number) {
    const t = (value - min) / span
    const y = invertY ? t : 1 - t
    return pad.top + y * innerH
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img">
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
          <text x={width - pad.right} y={yAt(reference.value) - 4} textAnchor="end" fill="#4ade80" fontSize="10">
            {reference.label}
          </text>
        </g>
      ) : null}
      {series.map((item) => {
        const points = item.data
          .map((value, index) => {
            if (!Number.isFinite(value) || value <= 0) return null
            return `${xAt(index)},${yAt(value)}`
          })
          .filter(Boolean)
          .join(' ')
        return (
          <g key={item.name}>
            <polyline fill="none" stroke={item.color} strokeWidth="2.5" points={points} />
            {item.data.map((value, index) =>
              Number.isFinite(value) && value > 0 ? (
                <circle key={`${item.name}-${index}`} cx={xAt(index)} cy={yAt(value)} r="3.5" fill={item.color} />
              ) : null,
            )}
          </g>
        )
      })}
      {categories.map((label, index) => (
        <text
          key={label + index}
          x={xAt(index)}
          y={height - 8}
          textAnchor="middle"
          fill="#a1a1aa"
          fontSize="10"
        >
          {label}
        </text>
      ))}
      <text x={4} y={pad.top + 4} fill="#a1a1aa" fontSize="10">
        {invertY ? max : min}
      </text>
      <text x={4} y={height - pad.bottom} fill="#a1a1aa" fontSize="10">
        {invertY ? min : max}
      </text>
    </svg>
  )
}

type BarChartProps = {
  categories: string[]
  values: number[]
  color?: string
  height?: number
  horizontal?: boolean
}

export function SimpleBarChart({
  categories,
  values,
  color = '#f5c518',
  height = 160,
  horizontal = false,
}: BarChartProps) {
  const width = 420
  const pad = { top: 8, right: 12, bottom: horizontal ? 12 : 28, left: horizontal ? 72 : 28 }
  const max = Math.max(1, ...values)
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom

  if (horizontal) {
    const rowH = innerH / Math.max(1, categories.length)
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img">
        {categories.map((label, index) => {
          const value = values[index] ?? 0
          const barW = (value / max) * innerW
          const y = pad.top + index * rowH + rowH * 0.15
          return (
            <g key={label}>
              <text x={pad.left - 6} y={y + rowH * 0.45} textAnchor="end" fill="#a1a1aa" fontSize="11">
                {label}
              </text>
              <rect x={pad.left} y={y} width={Math.max(0, barW)} height={rowH * 0.55} fill={color} />
              <text x={pad.left + barW + 4} y={y + rowH * 0.45} fill="#e4e4e7" fontSize="11">
                {Number.isInteger(value) ? value : value.toFixed(1)}
              </text>
            </g>
          )
        })}
      </svg>
    )
  }

  const gap = 8
  const barW = (innerW - gap * (categories.length - 1)) / Math.max(1, categories.length)
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img">
      {categories.map((label, index) => {
        const value = values[index] ?? 0
        const barH = (value / max) * innerH
        const x = pad.left + index * (barW + gap)
        const y = pad.top + innerH - barH
        return (
          <g key={label}>
            <rect x={x} y={y} width={barW} height={Math.max(0, barH)} fill={color} />
            <text x={x + barW / 2} y={height - 8} textAnchor="middle" fill="#a1a1aa" fontSize="10">
              {label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

type PieSlice = { label: string; value: number; color: string }

export function SimplePieChart({ data, size = 160 }: { data: PieSlice[]; size?: number }) {
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

  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
        {solid ? <circle cx={cx} cy={cy} r={r} fill={solid.color} /> : null}
        {paths.map((slice) => (
          <path key={slice.label} d={slice.d} fill={slice.color} />
        ))}
      </svg>
      <ul className="space-y-1 text-sm text-zinc-300">
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
  )
}
