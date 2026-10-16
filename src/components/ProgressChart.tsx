import { useEffect, useId, useState } from 'react'
import { raceTimeSeconds } from '../lib/format'
import type { LapProgressPoint } from '../lib/progressTracking'

const PLACE_COLOR = '#f5c518'
const TIME_COLOR = '#38bdf8'
const HEIGHT = 224

type PlotPoint = {
  lap: number
  place: number | null
  seconds: number | null
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

function numericPlace(place: string | null): number | null {
  if (place == null || place.trim() === '') return null
  const value = Number(place)
  return Number.isFinite(value) ? value : null
}

function toPlotPoints(points: LapProgressPoint[]): PlotPoint[] {
  return points.map((point) => ({
    lap: point.lap,
    place: numericPlace(point.place),
    seconds: raceTimeSeconds(point.lapTime),
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

export function ProgressTrackingChart({ riderLabel, points }: Props) {
  const labelId = useId()
  const ready = points.length >= 2
  const described = riderLabel
    ? `${riderLabel}. Place and lap time by lap.`
    : 'Place and lap time by lap.'

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
      {ready ? (
        <>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-zinc-300">
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-0.5 w-6" style={{ background: PLACE_COLOR }} />
              Place
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-0.5 w-6" style={{ background: TIME_COLOR }} />
              Lap time
            </span>
          </div>
          <ProgressPlot points={toPlotPoints(points)} label={described} />
        </>
      ) : (
        <p className="flex min-h-36 items-center justify-center text-center text-lg text-zinc-200">
          Waiting for 2 Laps data
        </p>
      )}
    </div>
  )
}

type HoverTip = {
  lap: number
  series: 'place' | 'time'
  x: number
  y: number
  place: number | null
  seconds: number | null
}

const HOVER_HIT_PX = 14

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1)
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

function ProgressPlot({ points, label }: { points: PlotPoint[]; label: string }) {
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

  const pad = { left: 56, right: 88, top: 28, bottom: 36 }
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

  const places = points.flatMap((point) => (point.place == null ? [] : [point.place]))
  const times = points.flatMap((point) => (point.seconds == null ? [] : [point.seconds]))
  const placeMin = places.length ? Math.min(...places) : 1
  const placeMax = places.length ? Math.max(...places) : 1
  const placeDomainMin = placeMin - 0.6
  const placeDomainMax = placeMax + 0.6
  const timeMin = times.length ? Math.min(...times) : 0
  const timeMax = times.length ? Math.max(...times) : 1
  const timeSpan = timeMax - timeMin || Math.max(Math.abs(timeMax) * 0.05, 0.5)
  const timeDomainMin = timeMin - timeSpan * 0.12
  const timeDomainMax = timeMax + timeSpan * 0.12

  const yPlace = (place: number) => yAt(place, placeDomainMin, placeDomainMax, top, bottom, true)
  const yTime = (seconds: number) => yAt(seconds, timeDomainMin, timeDomainMax, top, bottom, false)
  const placePaths = linePath(points, xOf, (point) => (point.place == null ? null : yPlace(point.place)))
  const timePaths = linePath(points, xOf, (point) => (point.seconds == null ? null : yTime(point.seconds)))
  const placeTicks = places.length ? integerTicks(placeMin, placeMax) : [1]
  const timeTicks = [0, 1, 2, 3].map((step) => timeDomainMin + ((timeDomainMax - timeDomainMin) * step) / 3)
  const lapStep = laps.length > 16 ? Math.ceil(laps.length / 12) : 1

  const tipFor = (point: PlotPoint, series: 'place' | 'time'): HoverTip | null => {
    if (series === 'place' && point.place != null) {
      return {
        lap: point.lap,
        series,
        x: xOf(point.lap),
        y: yPlace(point.place),
        place: point.place,
        seconds: point.seconds,
      }
    }
    if (series === 'time' && point.seconds != null) {
      return {
        lap: point.lap,
        series,
        x: xOf(point.lap),
        y: yTime(point.seconds),
        place: point.place,
        seconds: point.seconds,
      }
    }
    return null
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

    for (const series of ['place', 'time'] as const) {
      const seriesPoints = points.filter((point) => (series === 'place' ? point.place != null : point.seconds != null))
      for (let i = 0; i < seriesPoints.length; i++) {
        const point = seriesPoints[i]!
        const tip = tipFor(point, series)
        if (tip == null) continue
        consider(tip, Math.hypot(px - tip.x, py - tip.y))
        const next = seriesPoints[i + 1]
        if (!next) continue
        const nextTip = tipFor(next, series)
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

  const tipLeft = hover ? Math.min(Math.max(hover.x + 12, 8), Math.max(8, width - 140)) : 0
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
            <text x={pad.left} y={16} fill={PLACE_COLOR} fontSize="12" textAnchor="start">
              Place
            </text>
            <text x={width - pad.right} y={16} fill={TIME_COLOR} fontSize="12" textAnchor="end">
              Lap time
            </text>
            {placeTicks.map((tick) => {
              const y = yPlace(tick)
              return (
                <g key={`place-${tick}`}>
                  <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="rgb(255 255 255 / 0.08)" />
                  <text x={pad.left - 8} y={y + 4} textAnchor="end" fill="#a1a1aa" fontSize="12">
                    {tick}
                  </text>
                </g>
              )
            })}
            {timeTicks.map((tick) => (
              <text key={`time-${tick}`} x={width - pad.right + 8} y={yTime(tick) + 4} fill="#7dd3fc" fontSize="12">
                {formatAxisTime(tick)}
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
            {placePaths.map((path) => (
              <polyline
                key={path}
                points={path}
                fill="none"
                stroke={PLACE_COLOR}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {timePaths.map((path) => (
              <polyline
                key={path}
                points={path}
                fill="none"
                stroke={TIME_COLOR}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {points.map((point) =>
              point.place == null ? null : (
                <circle
                  key={`p-${point.lap}`}
                  cx={xOf(point.lap)}
                  cy={yPlace(point.place)}
                  r={hover?.lap === point.lap && hover.series === 'place' ? 5.5 : 3.5}
                  fill={PLACE_COLOR}
                />
              ),
            )}
            {points.map((point) =>
              point.seconds == null ? null : (
                <circle
                  key={`t-${point.lap}`}
                  cx={xOf(point.lap)}
                  cy={yTime(point.seconds)}
                  r={hover?.lap === point.lap && hover.series === 'time' ? 5.5 : 3.5}
                  fill={TIME_COLOR}
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
              {hover.series === 'place' && hover.place != null ? (
                <p style={{ color: PLACE_COLOR }}>Place {hover.place}</p>
              ) : null}
              {hover.series === 'time' && hover.seconds != null ? (
                <p style={{ color: TIME_COLOR }}>Lap time {formatAxisTime(hover.seconds)}</p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <div style={{ height: HEIGHT }} />
      )}
    </div>
  )
}
