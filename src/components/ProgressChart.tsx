import { useEffect, useId, useRef, useState } from 'react'
import { raceTimeSeconds } from '../lib/format'
import type { LapProgressPoint } from '../lib/progressTracking'

const LEFT_COLOR = '#f5c518'
const RIGHT_COLOR = '#38bdf8'
const HEIGHT = 224

const CHART_METRICS = [
  { id: 'place', label: 'Place', kind: 'rank' },
  { id: 'lapTime', label: 'Lap Time', kind: 'time' },
  { id: 'bestLap', label: 'Best Lap', kind: 'time' },
  { id: 'leaderGap', label: 'Gap to Leader', kind: 'time' },
  { id: 'nextGap', label: 'Gap to Next', kind: 'time' },
] as const

type MetricId = (typeof CHART_METRICS)[number]['id']
type MetricKind = (typeof CHART_METRICS)[number]['kind']
type AxisSide = 'left' | 'right'

const AXES_KEY = 'eventsync.chartAxes'
const DEFAULT_AXES = { left: 'place', right: 'lapTime' } as const

function isMetricId(value: unknown): value is MetricId {
  return CHART_METRICS.some((metric) => metric.id === value)
}

function loadChartAxes(): { left: MetricId; right: MetricId } {
  try {
    const raw = localStorage.getItem(AXES_KEY)
    if (!raw) return { ...DEFAULT_AXES }
    const parsed = JSON.parse(raw) as { left?: unknown; right?: unknown }
    return {
      left: isMetricId(parsed.left) ? parsed.left : DEFAULT_AXES.left,
      right: isMetricId(parsed.right) ? parsed.right : DEFAULT_AXES.right,
    }
  } catch {
    return { ...DEFAULT_AXES }
  }
}

function persistChartAxes(left: MetricId, right: MetricId) {
  try {
    localStorage.setItem(AXES_KEY, JSON.stringify({ left, right }))
  } catch {
    // Storage can be full or blocked. The in-memory choice still drives this visit.
  }
}

type Metric = (typeof CHART_METRICS)[number]

type PlotPoint = {
  lap: number
  left: number | null
  right: number | null
}

type Props = {
  riderLabel: string
  points: LapProgressPoint[]
}

export function ChartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M7 15l4-5 3 3 5-7" />
    </svg>
  )
}

function metricById(id: MetricId): Metric {
  return CHART_METRICS.find((metric) => metric.id === id) ?? CHART_METRICS[0]
}

function numericPlace(place: string | null): number | null {
  if (place == null || place.trim() === '') return null
  const value = Number(place)
  return Number.isFinite(value) ? value : null
}

function metricValue(point: LapProgressPoint, id: MetricId): number | null {
  switch (id) {
    case 'place':
      return numericPlace(point.place)
    case 'lapTime':
      return raceTimeSeconds(point.lapTime)
    case 'bestLap':
      return raceTimeSeconds(point.bestLapTime)
    case 'leaderGap':
      return raceTimeSeconds(point.leaderGap)
    case 'nextGap':
      return raceTimeSeconds(point.nextGap)
  }
}

function toPlotPoints(points: LapProgressPoint[], left: MetricId, right: MetricId): PlotPoint[] {
  return points.map((point) => ({
    lap: point.lap,
    left: metricValue(point, left),
    right: metricValue(point, right),
  }))
}

function formatAxisTime(seconds: number): string {
  const negative = seconds < 0
  const total = Math.abs(seconds)
  const minutes = Math.floor(total / 60)
  const remain = total - minutes * 60
  const text = `${minutes}:${remain.toFixed(2).padStart(5, '0')}`
  return negative ? `-${text}` : text
}

function formatMetric(value: number, kind: MetricKind): string {
  return kind === 'time' ? formatAxisTime(value) : String(value)
}

function yAt(value: number, min: number, max: number, top: number, bottom: number, minAtTop: boolean): number {
  if (max === min) return (top + bottom) / 2
  const t = (value - min) / (max - min)
  return minAtTop ? top + t * (bottom - top) : bottom - t * (bottom - top)
}

function linePath(
  points: PlotPoint[],
  xOf: (lap: number) => number,
  yOf: (point: PlotPoint) => number | null,
): string[] {
  const paths: string[] = []
  let current: string[] = []
  for (const point of points) {
    const y = yOf(point)
    if (y == null) {
      if (current.length > 0) paths.push(current.join(' '))
      current = []
      continue
    }
    current.push(`${xOf(point.lap)},${y}`)
  }
  if (current.length > 0) paths.push(current.join(' '))
  return paths
}

function integerTicks(min: number, max: number): number[] {
  const lo = Math.ceil(min)
  const hi = Math.floor(max)
  if (hi < lo) return [min]
  const span = hi - lo
  const step = span > 8 ? Math.ceil(span / 6) : 1
  const ticks: number[] = []
  for (let value = lo; value <= hi; value += step) ticks.push(value)
  if (ticks[ticks.length - 1] !== hi) ticks.push(hi)
  return ticks
}

function AxisSelect({
  side,
  color,
  value,
  onChange,
}: {
  side: AxisSide
  color: string
  value: MetricId
  onChange: (id: MetricId) => void
}) {
  const label = side === 'left' ? 'Left axis' : 'Right axis'
  return (
    <label className="inline-flex items-center gap-2">
      <span className="inline-block h-0.5 w-6" style={{ background: color }} />
      <span>{label}</span>
      <select
        className="min-h-11 cursor-pointer border border-zinc-500 bg-zinc-200 px-2 text-sm font-semibold text-black"
        style={{ colorScheme: 'light' }}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value as MetricId)}
      >
        {CHART_METRICS.map((metric) => (
          <option key={metric.id} value={metric.id}>
            {metric.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function ProgressTrackingChart({ riderLabel, points }: Props) {
  const labelId = useId()
  const legendRef = useRef<HTMLDivElement>(null)
  const ignoreOutsideRef = useRef(false)
  const [axesOpen, setAxesOpen] = useState(false)
  const [savedLeft, setSavedLeft] = useState<MetricId>(() => loadChartAxes().left)
  const [savedRight, setSavedRight] = useState<MetricId>(() => loadChartAxes().right)
  const [draftLeft, setDraftLeft] = useState<MetricId>(savedLeft)
  const [draftRight, setDraftRight] = useState<MetricId>(savedRight)
  const left = metricById(savedLeft)
  const right = metricById(savedRight)
  const ready = points.length >= 2
  const described = riderLabel
    ? `${riderLabel}. ${left.label} and ${right.label} by lap.`
    : `${left.label} and ${right.label} by lap.`

  useEffect(() => {
    if (!axesOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (ignoreOutsideRef.current) return
      const root = legendRef.current
      const target = event.target
      if (root && target instanceof Node && root.contains(target)) return
      setAxesOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [axesOpen])

  const openAxes = () => {
    setDraftLeft(savedLeft)
    setDraftRight(savedRight)
    setAxesOpen(true)
  }

  const keepEditorForSelect = () => {
    ignoreOutsideRef.current = true
    window.setTimeout(() => {
      ignoreOutsideRef.current = false
    }, 400)
  }

  const saveAxes = () => {
    setSavedLeft(draftLeft)
    setSavedRight(draftRight)
    persistChartAxes(draftLeft, draftRight)
    setAxesOpen(false)
  }

  return (
    <div className="border border-white/15 bg-[#141414] px-3 py-3" aria-labelledby={labelId}>
      {riderLabel ? (
        <p id={labelId} className="font-display text-xl font-bold uppercase">
          {riderLabel}
        </p>
      ) : (
        <p id={labelId} className="sr-only">
          Progress tracking
        </p>
      )}
      <div ref={legendRef} className="mt-2 flex flex-wrap items-center gap-4 text-sm text-zinc-300">
        {axesOpen ? (
          <>
            <AxisSelect
              side="left"
              color={LEFT_COLOR}
              value={draftLeft}
              onChange={(id) => {
                keepEditorForSelect()
                setDraftLeft(id)
              }}
            />
            <AxisSelect
              side="right"
              color={RIGHT_COLOR}
              value={draftRight}
              onChange={(id) => {
                keepEditorForSelect()
                setDraftRight(id)
              }}
            />
            <button type="button" className="btn min-h-11 px-4 text-base" onClick={saveAxes}>
              Save
            </button>
          </>
        ) : (
          <button
            type="button"
            className="inline-flex cursor-pointer flex-wrap items-center gap-4"
            aria-expanded={false}
            aria-label="Choose chart axes"
            onClick={openAxes}
          >
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-0.5 w-6" style={{ background: LEFT_COLOR }} />
              {left.label}
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-0.5 w-6" style={{ background: RIGHT_COLOR }} />
              {right.label}
            </span>
          </button>
        )}
      </div>
      {ready ? (
        <ProgressPlot points={toPlotPoints(points, savedLeft, savedRight)} label={described} left={left} right={right} />
      ) : (
        <p className="flex min-h-36 items-center justify-center text-center text-lg text-zinc-200">
          Chart is Waiting for 2 Laps Data...
        </p>
      )}
    </div>
  )
}

type HoverTip = {
  lap: number
  series: AxisSide
  x: number
  y: number
  text: string
  color: string
}

const HOVER_HIT_PX = 14

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1)
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

type AxisScale = {
  side: AxisSide
  metric: Metric
  color: string
  tickColor: string
  minAtTop: boolean
  domainMin: number
  domainMax: number
  ticks: number[]
  read: (point: PlotPoint) => number | null
}

function axisScale(side: AxisSide, metric: Metric, values: number[]): AxisScale {
  const rank = metric.kind === 'rank'
  const color = side === 'left' ? LEFT_COLOR : RIGHT_COLOR
  if (values.length === 0) {
    return {
      side,
      metric,
      color,
      tickColor: side === 'left' ? '#a1a1aa' : '#7dd3fc',
      minAtTop: rank,
      domainMin: rank ? 0.4 : 0,
      domainMax: rank ? 1.6 : 1,
      ticks: rank ? [1] : [0, 1],
      read: (point) => (side === 'left' ? point.left : point.right),
    }
  }
  const dataMin = Math.min(...values)
  const dataMax = Math.max(...values)
  if (rank) {
    return {
      side,
      metric,
      color,
      tickColor: '#a1a1aa',
      minAtTop: true,
      domainMin: dataMin - 0.6,
      domainMax: dataMax + 0.6,
      ticks: integerTicks(dataMin, dataMax),
      read: (point) => (side === 'left' ? point.left : point.right),
    }
  }
  const span = dataMax - dataMin || Math.max(Math.abs(dataMax) * 0.05, 0.5)
  const domainMin = dataMin - span * 0.12
  const domainMax = dataMax + span * 0.12
  return {
    side,
    metric,
    color,
    tickColor: side === 'left' ? '#a1a1aa' : '#7dd3fc',
    minAtTop: false,
    domainMin,
    domainMax,
    ticks: [0, 1, 2, 3].map((step) => domainMin + ((domainMax - domainMin) * step) / 3),
    read: (point) => (side === 'left' ? point.left : point.right),
  }
}

function ProgressPlot({
  points,
  label,
  left,
  right,
}: {
  points: PlotPoint[]
  label: string
  left: Metric
  right: Metric
}) {
  const [width, setWidth] = useState(0)
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const [hover, setHover] = useState<HoverTip | null>(null)

  useEffect(() => {
    if (!element) return
    const update = () => setWidth(Math.max(280, Math.floor(element.clientWidth)))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])

  const leftValues = points.flatMap((point) => (point.left == null ? [] : [point.left]))
  const rightValues = points.flatMap((point) => (point.right == null ? [] : [point.right]))
  const leftScale = axisScale('left', left, leftValues)
  const rightScale = axisScale('right', right, rightValues)
  const pad = {
    left: left.kind === 'time' ? 84 : 56,
    right: right.kind === 'time' ? 88 : 48,
    top: 28,
    bottom: 36,
  }
  const innerW = Math.max(40, width - pad.left - pad.right)
  const innerH = HEIGHT - pad.top - pad.bottom
  const top = pad.top
  const bottom = pad.top + innerH
  const laps = points.map((point) => point.lap)
  const xMinIndex = 0
  const xMaxIndex = Math.max(0, laps.length - 1)

  const xOf = (lap: number) => {
    const index = laps.indexOf(lap)
    if (xMaxIndex === xMinIndex) return pad.left + innerW / 2
    const inset = Math.min(16, innerW / 8)
    return pad.left + inset + (index / xMaxIndex) * (innerW - inset * 2)
  }

  const yOf = (scale: AxisScale, value: number) =>
    yAt(value, scale.domainMin, scale.domainMax, top, bottom, scale.minAtTop)
  const leftPaths = linePath(points, xOf, (point) => (point.left == null ? null : yOf(leftScale, point.left)))
  const rightPaths = linePath(points, xOf, (point) => (point.right == null ? null : yOf(rightScale, point.right)))
  const lapStep = laps.length > 16 ? Math.ceil(laps.length / 12) : 1
  const scales = [leftScale, rightScale]

  const tipFor = (point: PlotPoint, scale: AxisScale): HoverTip | null => {
    const value = scale.read(point)
    if (value == null) return null
    return {
      lap: point.lap,
      series: scale.side,
      x: xOf(point.lap),
      y: yOf(scale, value),
      text: `${scale.metric.label} ${formatMetric(value, scale.metric.kind)}`,
      color: scale.color,
    }
  }

  const findHover = (clientX: number, clientY: number, svg: SVGSVGElement): HoverTip | null => {
    const rect = svg.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    const scaleX = width / rect.width
    const scaleY = HEIGHT / rect.height
    const px = (clientX - rect.left) * scaleX
    const py = (clientY - rect.top) * scaleY
    let best: HoverTip | null = null
    let bestDist = HOVER_HIT_PX

    const consider = (tip: HoverTip | null, dist: number) => {
      if (tip == null || dist > bestDist) return
      bestDist = dist
      best = tip
    }

    for (const scale of scales) {
      const seriesPoints = points.filter((point) => scale.read(point) != null)
      for (let i = 0; i < seriesPoints.length; i++) {
        const point = seriesPoints[i]!
        const tip = tipFor(point, scale)
        if (tip == null) continue
        consider(tip, Math.hypot(px - tip.x, py - tip.y))
        const next = seriesPoints[i + 1]
        if (!next) continue
        const nextTip = tipFor(next, scale)
        if (nextTip == null) continue
        const segDist = distToSegment(px, py, tip.x, tip.y, nextTip.x, nextTip.y)
        if (segDist > bestDist) continue
        const nearer =
          Math.hypot(px - tip.x, py - tip.y) <= Math.hypot(px - nextTip.x, py - nextTip.y) ? tip : nextTip
        consider(nearer, segDist)
      }
    }
    return best
  }

  const tipLeft = hover ? Math.min(Math.max(hover.x + 12, 8), Math.max(8, width - 168)) : 0
  const tipTop = hover ? Math.min(Math.max(hover.y - 44, 4), Math.max(4, HEIGHT - 56)) : 0

  return (
    <div ref={setElement} className="relative mt-2">
      {width > 0 ? (
        <>
          <svg
            role="img"
            aria-label={label}
            width="100%"
            height={HEIGHT}
            viewBox={`0 0 ${width} ${HEIGHT}`}
            className="cursor-crosshair"
            onPointerMove={(event) => setHover(findHover(event.clientX, event.clientY, event.currentTarget))}
            onPointerLeave={() => setHover(null)}
          >
            <text x={pad.left} y={16} fill={LEFT_COLOR} fontSize="12" textAnchor="start">
              {left.label}
            </text>
            <text x={width - pad.right} y={16} fill={RIGHT_COLOR} fontSize="12" textAnchor="end">
              {right.label}
            </text>
            {leftScale.ticks.map((tick) => {
              const y = yOf(leftScale, tick)
              return (
                <g key={`left-${tick}`}>
                  <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="rgb(255 255 255 / 0.08)" />
                  <text x={pad.left - 8} y={y + 4} textAnchor="end" fill={leftScale.tickColor} fontSize="12">
                    {formatMetric(tick, left.kind)}
                  </text>
                </g>
              )
            })}
            {rightScale.ticks.map((tick) => (
              <text
                key={`right-${tick}`}
                x={width - pad.right + 8}
                y={yOf(rightScale, tick) + 4}
                fill={rightScale.tickColor}
                fontSize="12"
              >
                {formatMetric(tick, right.kind)}
              </text>
            ))}
            <line x1={pad.left} x2={pad.left} y1={top} y2={bottom} stroke="#a1a1aa" />
            <line x1={width - pad.right} x2={width - pad.right} y1={top} y2={bottom} stroke="#7dd3fc" />
            <line x1={pad.left} x2={width - pad.right} y1={bottom} y2={bottom} stroke="#a1a1aa" />
            <text x={pad.left + innerW / 2} y={HEIGHT - 8} fill="#a1a1aa" fontSize="12" textAnchor="middle">
              Lap
            </text>
            {laps.map((lap, index) =>
              index % lapStep === 0 ? (
                <text key={lap} x={xOf(lap)} y={bottom + 16} fill="#d4d4d8" fontSize="12" textAnchor="middle">
                  {lap}
                </text>
              ) : null,
            )}
            {leftPaths.map((path) => (
              <polyline
                key={`left-${path}`}
                points={path}
                fill="none"
                stroke={LEFT_COLOR}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {rightPaths.map((path) => (
              <polyline
                key={`right-${path}`}
                points={path}
                fill="none"
                stroke={RIGHT_COLOR}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {points.map((point) =>
              point.left == null ? null : (
                <circle
                  key={`left-${point.lap}`}
                  cx={xOf(point.lap)}
                  cy={yOf(leftScale, point.left)}
                  r={hover?.lap === point.lap && hover.series === 'left' ? 5.5 : 3.5}
                  fill={LEFT_COLOR}
                />
              ),
            )}
            {points.map((point) =>
              point.right == null ? null : (
                <circle
                  key={`right-${point.lap}`}
                  cx={xOf(point.lap)}
                  cy={yOf(rightScale, point.right)}
                  r={hover?.lap === point.lap && hover.series === 'right' ? 5.5 : 3.5}
                  fill={RIGHT_COLOR}
                />
              ),
            )}
          </svg>
          {hover ? (
            <div
              className="pointer-events-none absolute z-10 min-w-[7.5rem] border border-white/20 bg-[#0a0a0a]/95 px-2 py-1.5 text-xs shadow-lg"
              style={{ left: tipLeft, top: tipTop }}
              role="tooltip"
            >
              <p className="font-semibold text-zinc-200">Lap {hover.lap}</p>
              <p style={{ color: hover.color }}>{hover.text}</p>
            </div>
          ) : null}
        </>
      ) : (
        <div style={{ height: HEIGHT }} />
      )}
    </div>
  )
}
