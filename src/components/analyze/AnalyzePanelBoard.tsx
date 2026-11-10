import { useEffect, useRef, useState } from 'react'
import type { AnalyzeSnapshot } from '../../lib/analyzeMetrics'
import {
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

export function AnalyzePanelBoard({ snapshot, rows, focusClassName }: Props) {
  const [order, setOrder] = useState<AnalyzePanelId[]>(() => loadAnalyzePanelLayout().order)
  const [collapsed, setCollapsed] = useState<Set<AnalyzePanelId>>(
    () => new Set(loadAnalyzePanelLayout().collapsed),
  )
  const [standingsClassOverride, setStandingsClassOverride] = useState<string | null>(null)
  const [swapFor, setSwapFor] = useState<AnalyzePanelId | null>(null)
  const [draggingId, setDraggingId] = useState<AnalyzePanelId | null>(null)
  const longPressTimer = useRef<number | null>(null)
  const longPressOrigin = useRef<{ x: number; y: number } | null>(null)
  const touchDragId = useRef<AnalyzePanelId | null>(null)
  const prevFocusClass = useRef(focusClassName)

  // When header class changes, re-default Standings to that class (local override only).
  useEffect(() => {
    if (prevFocusClass.current !== focusClassName) {
      prevFocusClass.current = focusClassName
      setStandingsClassOverride(null)
    }
  }, [focusClassName])

  const standingsClass =
    standingsClassOverride && snapshot.classNames.includes(standingsClassOverride)
      ? standingsClassOverride
      : focusClassName && snapshot.classNames.includes(focusClassName)
        ? focusClassName
        : (snapshot.classNames[0] ?? null)

  useEffect(() => {
    saveAnalyzePanelLayout({ order, collapsed: [...collapsed] })
  }, [order, collapsed])

  function toggleCollapsed(id: AnalyzePanelId) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function reorder(fromId: AnalyzePanelId, toId: AnalyzePanelId) {
    if (fromId === toId) return
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
    setOrder((prev) => prev.map((id) => (id === slotId ? replacement : id)))
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.delete(slotId)
      return next
    })
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
          const isCollapsed = collapsed.has(id)
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
                <button
                  type="button"
                  className="inline-flex min-h-10 min-w-10 items-center justify-center text-zinc-400 hover:text-white"
                  aria-expanded={!isCollapsed}
                  title={isCollapsed ? 'Expand panel' : 'Collapse panel'}
                  onClick={() => toggleCollapsed(id)}
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                    {isCollapsed ? (
                      <path fill="currentColor" d="M9 6.5 15.5 12 9 17.5V6.5Z" />
                    ) : (
                      <path fill="currentColor" d="M6.5 9 12 15.5 17.5 9H6.5Z" />
                    )}
                  </svg>
                </button>
                <button
                  type="button"
                  className="min-w-0 flex-1 cursor-grab touch-manipulation text-left text-sm font-semibold uppercase tracking-wide text-zinc-200 active:cursor-grabbing"
                  title="Drag to reorder"
                  onClick={() => toggleCollapsed(id)}
                >
                  {def.title}
                </button>
                <button
                  type="button"
                  className="shrink-0 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-[#f5c518] hover:bg-white/5"
                  title="Select a different panel"
                  onClick={() => setSwapFor(id)}
                >
                  Select
                </button>
              </header>
              {!isCollapsed ? (
                <div className="min-h-[260px] flex-1 p-3">
                  <AnalyzePanelBody
                    panelId={id}
                    snapshot={snapshot}
                    rows={rows}
                    focusClassName={focusClassName}
                    standingsClass={standingsClass}
                    onStandingsClassChange={setStandingsClassOverride}
                  />
                </div>
              ) : null}
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
