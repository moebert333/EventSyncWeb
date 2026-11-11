import { useEffect, useRef, useState } from 'react'
import type { AnalyzeSnapshot } from '../../lib/analyzeMetrics'
import {
  analyzeLayoutBand,
  defaultPanelIdsForEventsRun,
  loadAnalyzePanelLayout,
  panelDef,
  saveAnalyzePanelLayout,
  unusedPanelIds,
  type AnalyzePanelId,
} from '../../lib/analyzePanels'
import type { EventClassResult } from '../../types/database'
import { AnalyzePanelBody } from './AnalyzePanelBody'

const LONG_PRESS_MS = 420
const MOVE_CANCEL_PX = 10

type Props = {
  snapshot: AnalyzeSnapshot
  rows: EventClassResult[]
  focusClassName: string | null
}

function initialPanelOrder(eventsRun: number): AnalyzePanelId[] {
  const loaded = loadAnalyzePanelLayout(eventsRun)
  return loaded.custom === true ? loaded.order : defaultPanelIdsForEventsRun(eventsRun)
}

export function AnalyzePanelBoard({ snapshot, rows, focusClassName }: Props) {
  const eventsRun = snapshot.summary.eventsRun
  const band = analyzeLayoutBand(eventsRun)
  const [order, setOrder] = useState<AnalyzePanelId[]>(() => initialPanelOrder(eventsRun))
  const [custom, setCustom] = useState(() => loadAnalyzePanelLayout(eventsRun).custom === true)
  const [standingsClassOverride, setStandingsClassOverride] = useState<string | null>(null)
  const [swapFor, setSwapFor] = useState<AnalyzePanelId | null>(null)
  const [draggingId, setDraggingId] = useState<AnalyzePanelId | null>(null)
  const longPressTimer = useRef<number | null>(null)
  const longPressOrigin = useRef<{ x: number; y: number } | null>(null)
  const touchDragId = useRef<AnalyzePanelId | null>(null)
  const prevFocusClass = useRef(focusClassName)
  const prevBand = useRef(band)

  // When header class changes, re-default Standings to that class (local override only).
  useEffect(() => {
    if (prevFocusClass.current !== focusClassName) {
      prevFocusClass.current = focusClassName
      setStandingsClassOverride(null)
    }
  }, [focusClassName])

  // Separate early (≤2) vs full (3+) layouts so a full-series custom order cannot stick.
  useEffect(() => {
    if (prevBand.current === band) {
      if (custom) return
      setOrder(defaultPanelIdsForEventsRun(eventsRun))
      return
    }
    prevBand.current = band
    const loaded = loadAnalyzePanelLayout(eventsRun)
    setCustom(loaded.custom === true)
    setOrder(loaded.custom === true ? loaded.order : defaultPanelIdsForEventsRun(eventsRun))
  }, [band, eventsRun, custom])

  const standingsClass =
    standingsClassOverride && snapshot.classNames.includes(standingsClassOverride)
      ? standingsClassOverride
      : focusClassName && snapshot.classNames.includes(focusClassName)
        ? focusClassName
        : (snapshot.classNames[0] ?? null)

  useEffect(() => {
    saveAnalyzePanelLayout({ order, collapsed: [], custom }, eventsRun)
  }, [order, custom, eventsRun])

  function markCustom() {
    setCustom(true)
  }

  function reorder(fromId: AnalyzePanelId, toId: AnalyzePanelId) {
    if (fromId === toId) return
    markCustom()
    setOrder((prev) => {
      const next = [...prev]
      const from = next.indexOf(fromId)
      const to = next.indexOf(toId)
      if (from < 0 || to < 0) return prev
      next.splice(from, 1)
      next.splice(to, 0, fromId)
      return next
    })
  }

  function swapPanel(slotId: AnalyzePanelId, replacement: AnalyzePanelId) {
    markCustom()
    setOrder((prev) => prev.map((id) => (id === slotId ? replacement : id)))
    setSwapFor(null)
  }

  function clearLongPress() {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    longPressOrigin.current = null
  }

  const unused = unusedPanelIds(order)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-xl font-bold uppercase tracking-wide text-zinc-200">
          Your Analysis
        </h2>
        <p className="text-xs text-zinc-500">Drag to reorder · Select to change</p>
      </div>

      <div className="grid grid-cols-1 gap-3 min-[640px]:grid-cols-2 min-[1024px]:grid-cols-3">
        {order.map((id) => {
          const def = panelDef(id)
          const isDragging = draggingId === id
          return (
            <article
              key={id}
              className={`flex flex-col border border-white/12 bg-[#1a1a1a] ${
                isDragging ? 'opacity-60' : ''
              }`}
              draggable
              onDragStart={(event) => {
                setDraggingId(id)
                event.dataTransfer.setData('text/panel-id', id)
                event.dataTransfer.effectAllowed = 'move'
              }}
              onDragEnd={() => setDraggingId(null)}
              onDragOver={(event) => {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
              }}
              onDrop={(event) => {
                event.preventDefault()
                const from =
                  (event.dataTransfer.getData('text/panel-id') as AnalyzePanelId) ||
                  touchDragId.current
                if (from) reorder(from, id)
                touchDragId.current = null
                setDraggingId(null)
              }}
              onTouchStart={(event) => {
                const touch = event.touches[0]
                if (!touch) return
                clearLongPress()
                longPressOrigin.current = { x: touch.clientX, y: touch.clientY }
                longPressTimer.current = window.setTimeout(() => {
                  touchDragId.current = id
                  setDraggingId(id)
                }, LONG_PRESS_MS)
              }}
              onTouchMove={(event) => {
                const origin = longPressOrigin.current
                const touch = event.touches[0]
                if (!origin || !touch) return
                if (
                  Math.hypot(touch.clientX - origin.x, touch.clientY - origin.y) > MOVE_CANCEL_PX &&
                  touchDragId.current == null
                ) {
                  clearLongPress()
                }
              }}
              onTouchEnd={(event) => {
                clearLongPress()
                if (touchDragId.current == null) return
                const touch = event.changedTouches[0]
                if (!touch) {
                  touchDragId.current = null
                  setDraggingId(null)
                  return
                }
                const el = document.elementFromPoint(touch.clientX, touch.clientY)
                const marked = el?.closest('[data-panel-id]') as HTMLElement | null
                const dropId = (marked?.dataset.panelId as AnalyzePanelId | undefined) ?? null
                if (dropId) reorder(touchDragId.current, dropId)
                touchDragId.current = null
                setDraggingId(null)
              }}
              data-panel-id={id}
            >
              <header className="flex items-center gap-1 border-b border-white/10 px-2 py-1.5">
                <span
                  className="min-w-0 flex-1 cursor-grab touch-manipulation truncate px-2 text-left text-sm font-semibold uppercase tracking-wide text-zinc-200 active:cursor-grabbing"
                  title="Drag to reorder"
                >
                  {def.title}
                </span>
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-[#f5c518] hover:bg-white/5"
                  title="Select a different panel"
                  onClick={() => setSwapFor(id)}
                >
                  Select
                  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                    <path fill="currentColor" d="M6.5 9 12 15.5 17.5 9H6.5Z" />
                  </svg>
                </button>
              </header>
              <div className="flex min-h-[280px] flex-1 flex-col p-3">
                <AnalyzePanelBody
                  panelId={id}
                  snapshot={snapshot}
                  rows={rows}
                  focusClassName={focusClassName}
                  standingsClass={standingsClass}
                  onStandingsClassChange={setStandingsClassOverride}
                />
              </div>
            </article>
          )
        })}
      </div>

      {swapFor ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Select panel"
          onClick={() => setSwapFor(null)}
        >
          <div
            className="w-full max-w-md border border-[#f5c518] bg-[#1a1a1a] p-4 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Select a panel to replace “{panelDef(swapFor).title}”
            </p>
            <ul className="mt-3 max-h-72 space-y-1 overflow-auto">
              {unused.length === 0 ? (
                <li className="text-sm text-zinc-500">All panel types are already shown.</li>
              ) : (
                unused.map((id) => {
                  const def = panelDef(id)
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        className="w-full border border-white/10 px-3 py-3 text-left hover:border-[#f5c518]/50 hover:bg-white/5"
                        onClick={() => swapPanel(swapFor, id)}
                      >
                        <span className="block font-semibold text-white">{def.title}</span>
                        <span className="block text-sm text-zinc-400">{def.description}</span>
                      </button>
                    </li>
                  )
                })
              )}
            </ul>
            <button type="button" className="btn-ghost btn mt-3 w-full" onClick={() => setSwapFor(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
