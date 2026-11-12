import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChartIcon, ProgressTrackingChart } from '../components/ProgressChart'
import { EventParticipantHeader } from '../components/EventParticipantHeader'
import { RaceActivityIcon } from '../components/RaceActivityIcon'
import { RaceStatusVideo, VideoIcon, raceStatusVideoSrc } from '../components/RaceStatusVideo'
import { Skeleton } from '../components/Skeleton'
import { StatusPill } from '../components/StatusPill'
import { useEventCode } from '../hooks/useEventCode'
import { useLiveTiming, useRaceClassNames, useRaceInProgress } from '../hooks/useRaceInProgress'
import { useElapsedRaceClock } from '../hooks/useElapsedRaceClock'
import { useSimulationOptional } from '../lib/simulationContext'
import {
  bestLapLabel,
  formatRaceTime,
  formatActiveSessionTitle,
  formatLiveSessionLabel,
  formatRaceTitle,
  placeRank,
  raceTimeSeconds,
  riderName,
} from '../lib/format'
import { lapPointsForParticipant, latestTimingRows } from '../lib/progressTracking'
import type { ActiveRaceTiming, RaceStatus } from '../types/database'

/** Typical mobile long-press (Material / iOS context-menu range). */
const HIDE_MEDIA_LONG_PRESS_MS = 500
const HIDE_MEDIA_MOVE_CANCEL_PX = 12
/** Long-press a class chip to add it without clearing other selected classes. */
const CLASS_LONG_PRESS_MS = 500
const CLASS_LONG_PRESS_MOVE_CANCEL_PX = 12

type HighlightMode = 'firstPlace' | 'bestLap' | 'participant'

/** Closed control label. */
const HIGHLIGHT_LABELS: Record<HighlightMode, string> = {
  firstPlace: '1st Place',
  bestLap: 'Best Lap',
  participant: 'Rider',
}

/** Dropdown option label (Best Lap Time only while the menu is open). */
const HIGHLIGHT_MENU_LABELS: Record<HighlightMode, string> = {
  firstPlace: '1st Place',
  bestLap: 'Best Lap Time',
  participant: 'Rider',
}

const LIVE: RaceStatus[] = ['Staging', 'Active', 'Paused']

const SORT_COLUMNS = [
  'class',
  'place',
  'plate',
  'rider',
  'lap',
  'lapTime',
  'bestLap',
  'elapsed',
  'leaderGap',
  'nextGap',
  'status',
] as const

type SortColumn = (typeof SORT_COLUMNS)[number]
type SortDirection = 'asc' | 'desc'
type SortState = { column: SortColumn; direction: SortDirection }

const DEFAULT_SORT: SortState = { column: 'class', direction: 'asc' }
const PLACE_SORT: SortState = { column: 'place', direction: 'asc' }

const COLUMN_LABELS: Record<SortColumn, string> = {
  class: 'Class',
  place: 'Place',
  plate: 'Plate',
  rider: 'Rider',
  lap: 'Lap',
  lapTime: 'Lap Time',
  bestLap: 'Best lap',
  elapsed: 'Elapsed',
  leaderGap: 'Gap to leader',
  nextGap: 'Gap to next',
  status: 'Status',
}

function groupByClass(rows: ActiveRaceTiming[]): Map<string, ActiveRaceTiming[]> {
  const sorted = rows.slice().sort((a, b) => {
    return a.class_name.localeCompare(b.class_name) || placeRank(a.place_num) - placeRank(b.place_num)
  })
  const groups = new Map<string, ActiveRaceTiming[]>()
  for (const row of sorted) {
    const list = groups.get(row.class_name) ?? []
    list.push(row)
    groups.set(row.class_name, list)
  }
  return groups
}

function classNamesFor(fromQuery: string[], fromTiming: string[]): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const name of fromQuery) {
    if (!name || seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  for (const name of fromTiming.slice().sort((a, b) => a.localeCompare(b))) {
    if (!name || seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}

function rowKey(row: ActiveRaceTiming): string {
  return `${row.class_id}-${row.participant_id}`
}

function compareText(a: string, b: string, direction: SortDirection): number {
  const aEmpty = a.trim() === ''
  const bEmpty = b.trim() === ''
  if (aEmpty && bEmpty) return 0
  if (aEmpty) return 1
  if (bEmpty) return -1
  const result = a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  return direction === 'asc' ? result : -result
}

function compareNumber(a: number | null, b: number | null, direction: SortDirection): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return direction === 'asc' ? a - b : b - a
}

function compareColumn(a: ActiveRaceTiming, b: ActiveRaceTiming, column: SortColumn, direction: SortDirection): number {
  switch (column) {
    case 'class':
      return compareText(a.class_name, b.class_name, direction)
    case 'place': {
      const rank = (place: string | null) => {
        const value = placeRank(place)
        return value >= 8_000 ? null : value
      }
      return compareNumber(rank(a.place_num), rank(b.place_num), direction)
    }
    case 'plate':
      return compareText(a.participant_plate ?? '', b.participant_plate ?? '', direction)
    case 'rider':
      return compareText(riderName(a.first_name, a.last_name), riderName(b.first_name, b.last_name), direction)
    case 'lap':
      return compareNumber(a.current_lap_num, b.current_lap_num, direction)
    case 'lapTime':
      return compareNumber(raceTimeSeconds(a.current_lap_time), raceTimeSeconds(b.current_lap_time), direction)
    case 'bestLap':
      return (
        compareNumber(raceTimeSeconds(a.best_lap_time), raceTimeSeconds(b.best_lap_time), direction) ||
        compareNumber(a.best_lap_num, b.best_lap_num, direction)
      )
    case 'elapsed':
      return compareNumber(raceTimeSeconds(a.race_elapsed_time), raceTimeSeconds(b.race_elapsed_time), direction)
    case 'leaderGap':
      return compareNumber(raceTimeSeconds(a.leader_gap_time), raceTimeSeconds(b.leader_gap_time), direction)
    case 'nextGap':
      return compareNumber(raceTimeSeconds(a.next_gap_time), raceTimeSeconds(b.next_gap_time), direction)
    case 'status':
      return compareText(a.status ?? '', b.status ?? '', direction)
  }
}

/** Primary column, then Class, then Place, so the default order is Class then Place. */
function compareRows(a: ActiveRaceTiming, b: ActiveRaceTiming, sort: SortState): number {
  const primary = compareColumn(a, b, sort.column, sort.direction)
  if (primary !== 0) return primary
  if (sort.column !== 'class') {
    const byClass = compareText(a.class_name, b.class_name, 'asc')
    if (byClass !== 0) return byClass
  }
  if (sort.column !== 'place') {
    const byPlace = placeRank(a.place_num) - placeRank(b.place_num)
    if (byPlace !== 0) return byPlace
  }
  return a.participant_id - b.participant_id
}

function SortHeader({
  column,
  sort,
  onSort,
}: {
  column: SortColumn
  sort: SortState
  onSort: (column: SortColumn) => void
}) {
  const active = sort.column === column
  return (
    <th aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        title={`Sort by ${COLUMN_LABELS[column]}`}
        className={`inline-flex cursor-pointer items-center gap-1 bg-transparent p-0 font-[inherit] text-[length:inherit] tracking-[inherit] uppercase ${
          active ? 'text-white' : 'text-inherit'
        }`}
        onClick={() => onSort(column)}
      >
        {COLUMN_LABELS[column]}
        {active ? <span aria-hidden="true">{sort.direction === 'asc' ? '▲' : '▼'}</span> : null}
      </button>
    </th>
  )
}

/** Greatest lap, then lowest current lap time. Place breaks remaining ties. */
function bestLapLeadRow(rows: ActiveRaceTiming[]): ActiveRaceTiming | null {
  const started = rows.filter((row) => (row.current_lap_num ?? 0) >= 1)
  if (started.length === 0) return null
  const maxLap = Math.max(...started.map((row) => row.current_lap_num ?? 0))
  const contenders = started.filter((row) => row.current_lap_num === maxLap)
  return contenders.slice().sort((a, b) => {
    const aTime = raceTimeSeconds(a.current_lap_time)
    const bTime = raceTimeSeconds(b.current_lap_time)
    if (aTime == null && bTime != null) return 1
    if (bTime == null && aTime != null) return -1
    if (aTime != null && bTime != null && aTime !== bTime) return aTime - bTime
    return placeRank(a.place_num) - placeRank(b.place_num) || a.participant_id - b.participant_id
  })[0] ?? null
}

function firstPlaceRow(rows: ActiveRaceTiming[]): ActiveRaceTiming | null {
  const contenders = rows.filter((row) => placeRank(row.place_num) === 1)
  if (contenders.length === 0) return null
  return contenders.slice().sort((a, b) => a.participant_id - b.participant_id)[0] ?? null
}

function highlightRow(
  rows: ActiveRaceTiming[],
  mode: HighlightMode,
  participantId: number | null,
): ActiveRaceTiming | null {
  if (mode === 'firstPlace') return firstPlaceRow(rows)
  if (mode === 'participant') {
    if (participantId == null) return null
    return rows.find((row) => row.participant_id === participantId) ?? null
  }
  return bestLapLeadRow(rows)
}

/**
 * Survives /live remounts so chart vs video and class chip stay as left.
 * First visit defaults to Video open; later returns restore the last choice.
 * Chart/video also switches to Video when race status changes (including while away).
 */
let rememberedPanelEventId: number | null = null
let rememberedPanelRaceId: number | null | undefined = undefined
/** True until the user hides video or opens the chart — so first /live visit shows video. */
let rememberedVideoOpen = true
let rememberedChartOpen = false
/** In-visit class chip selection; cleared on race change / page entry so first class wins. */
let rememberedSelectedClasses: string[] | null = null
/** `classId-participantId` from the last selected table row. */
let rememberedSelectedKey: string | null = null
/** Last race status seen on this page; used to open Video only on status change. */
let rememberedRaceStatus: RaceStatus | null = null
/**
 * Auto-open chart once after 3 laps, once per live race/practice or simulation run.
 * Key is `live:<raceId>` or `sim:<generation>`.
 */
let rememberedAutoChartKey: string | null = null
let autoChartSimGen = 0
let lastSeenSimulatingForAutoChart = false
/**
 * Rider row click before 2 laps: keep selection, open chart once that rider reaches 2 laps.
 * Value is `classId-participantId`.
 */
let pendingChartRiderKey: string | null = null

const AUTO_CHART_AFTER_LAPS = 3
/** Open chart for a clicked rider once they have this many laps. */
const CHART_READY_LAPS = 2

export function RacesInProgressPage() {
  const { context, selectedParticipant } = useEventCode()
  const simulation = useSimulationOptional()
  const simulating = Boolean(simulation?.isActive)
  // Demo keeps next-race / warning strip; manual single-race sim still hides it.
  const showParticipantHeader = !simulating || Boolean(simulation?.isDemoMode)
  if (simulating && !lastSeenSimulatingForAutoChart) {
    autoChartSimGen += 1
  }
  lastSeenSimulatingForAutoChart = simulating
  const raceQuery = useRaceInProgress(context?.eventId ?? null)
  const live = raceQuery.data?.status != null && LIVE.includes(raceQuery.data.status)
  const timingQuery = useLiveTiming(raceQuery.data)
  const classQuery = useRaceClassNames(raceQuery.data?.race_id ?? null, live)
  const elapsedDisplay = useElapsedRaceClock(
    raceQuery.data?.elapsed_race_time,
    raceQuery.data?.status === 'Active',
  )
  const raceId = raceQuery.data?.race_id ?? null
  /** Full lap history from `active_race_timing` (PK includes current_lap_num). */
  const allTimingRows = (timingQuery.data ?? []).filter(
    (row) => !(row.first_name ?? '').startsWith('0000'),
  )
  /** Live table shows only the latest lap per class + participant. */
  const timingRows = latestTimingRows(allTimingRows)
  const groups = groupByClass(timingRows)
  const classNames = classNamesFor(
    (classQuery.data ?? []).map((row) => row.class_name),
    [...groups.keys()],
  )
  /** Unset until the first successful load; then tracks the shown race id. */
  const [selectionRaceId, setSelectionRaceId] = useState<number | null | undefined>(undefined)
  // Always start empty; first class is applied when race/class names are ready.
  const [selectedClasses, setSelectedClasses] = useState<string[]>([])
  const [sort, setSort] = useState<SortState>(PLACE_SORT)
  const [selectedKey, setSelectedKey] = useState<string | null>(() => rememberedSelectedKey)
  const [chartOpen, setChartOpen] = useState(() => rememberedChartOpen)
  const [videoOpen, setVideoOpen] = useState(() => rememberedVideoOpen)
  const [highlightMode, setHighlightMode] = useState<HighlightMode>('bestLap')
  const [highlightMenuOpen, setHighlightMenuOpen] = useState(false)
  const highlightMenuRef = useRef<HTMLDivElement>(null)
  const appliedParticipantRaceRef = useRef<number | null>(null)
  const hideLongPressTimer = useRef<number | null>(null)
  const hideLongPressOrigin = useRef<{ x: number; y: number } | null>(null)
  const classLongPressTimer = useRef<number | null>(null)
  const classLongPressOrigin = useRef<{ x: number; y: number } | null>(null)
  const suppressClassClick = useRef(false)

  function clearHideLongPress() {
    if (hideLongPressTimer.current != null) {
      window.clearTimeout(hideLongPressTimer.current)
      hideLongPressTimer.current = null
    }
    hideLongPressOrigin.current = null
  }

  function clearClassLongPress() {
    if (classLongPressTimer.current != null) {
      window.clearTimeout(classLongPressTimer.current)
      classLongPressTimer.current = null
    }
    classLongPressOrigin.current = null
  }

  function clearTextSelection() {
    const selection = window.getSelection()
    if (selection == null || selection.rangeCount === 0) return
    selection.removeAllRanges()
  }

  function hideMedia(kind: 'chart' | 'video') {
    clearTextSelection()
    if (kind === 'chart') {
      rememberedChartOpen = false
      setChartOpen(false)
    } else {
      rememberedVideoOpen = false
      setVideoOpen(false)
    }
    // Long-press can leave a selection on content revealed after hide.
    requestAnimationFrame(() => {
      clearTextSelection()
      window.setTimeout(clearTextSelection, 0)
    })
  }

  function hideMediaLongPressHandlers(kind: 'chart' | 'video') {
    return {
      onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return
        clearHideLongPress()
        clearTextSelection()
        hideLongPressOrigin.current = { x: event.clientX, y: event.clientY }
        hideLongPressTimer.current = window.setTimeout(() => {
          hideLongPressTimer.current = null
          hideLongPressOrigin.current = null
          hideMedia(kind)
        }, HIDE_MEDIA_LONG_PRESS_MS)
      },
      onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
        const origin = hideLongPressOrigin.current
        if (origin == null) return
        if (
          Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > HIDE_MEDIA_MOVE_CANCEL_PX
        ) {
          clearHideLongPress()
        }
      },
      onPointerUp: clearHideLongPress,
      onPointerLeave: clearHideLongPress,
      onPointerCancel: clearHideLongPress,
      onContextMenu: (event: { preventDefault: () => void }) => {
        event.preventDefault()
      },
      style: {
        WebkitUserSelect: 'none',
        userSelect: 'none',
        WebkitTouchCallout: 'none',
      } as const,
    }
  }

  // Local copies so same-render chart/selection logic sees restored values (setState is async).
  let liveSelectedKey = selectedKey
  let liveSelectedClasses = selectedClasses

  if (raceQuery.isSuccess && selectionRaceId !== raceId) {
    const eventId = context?.eventId ?? null
    const raceChanged =
      rememberedPanelEventId !== eventId || rememberedPanelRaceId !== raceId
    setSelectionRaceId(raceId)
    // Entering /live or a new active race: always select the first class only.
    // `null` means “pending first class” until class names are available.
    const initialClasses = classNames[0] != null ? [classNames[0]] : []
    liveSelectedClasses = initialClasses
    rememberedSelectedClasses = classNames[0] != null ? initialClasses : null
    liveSelectedKey = rememberedSelectedKey
    setSelectedClasses(initialClasses)
    setSort(PLACE_SORT)
    setSelectedKey(liveSelectedKey)
    // Always restore last chart/video view on remount; status changes switch to Video separately.
    setChartOpen(rememberedChartOpen)
    setVideoOpen(rememberedVideoOpen)
    appliedParticipantRaceRef.current = null
    if (raceChanged) {
      rememberedPanelEventId = eventId
      rememberedPanelRaceId = raceId
      pendingChartRiderKey = null
    }
  }

  // Drop chips for classes that left this race.
  const prunedSelected = liveSelectedClasses.filter((name) => classNames.includes(name))
  if (prunedSelected.length !== liveSelectedClasses.length) {
    liveSelectedClasses = prunedSelected
    setSelectedClasses(prunedSelected)
    if (rememberedSelectedClasses != null) rememberedSelectedClasses = prunedSelected
  }
  // After page entry / race change (or empty prune), select the first class.
  if (rememberedSelectedClasses === null && classNames.length > 0) {
    const initial = [classNames[0]!]
    liveSelectedClasses = initial
    rememberedSelectedClasses = initial
    setSelectedClasses(initial)
  }

  if (
    raceId != null &&
    appliedParticipantRaceRef.current !== raceId &&
    timingQuery.isSuccess &&
    selectedParticipant
  ) {
    const match = timingRows.find((row) => row.participant_id === selectedParticipant.participantId)
    const restoredInRace =
      liveSelectedKey != null && timingRows.some((row) => rowKey(row) === liveSelectedKey)
    if (match) {
      appliedParticipantRaceRef.current = raceId
      // Prefer the restored table selection when that rider is still in this race.
      if (!restoredInRace) {
        liveSelectedKey = rowKey(match)
        setSelectedKey(liveSelectedKey)
      }
    } else if (timingRows.length > 0) {
      // Race has timing; selected participant is not in this race.
      appliedParticipantRaceRef.current = raceId
    }
  }

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  // Open Video only when race status changes (including while away from this page).
  useEffect(() => {
    const status = raceQuery.data?.status ?? null
    if (status == null) return
    if (rememberedRaceStatus != null && rememberedRaceStatus !== status) {
      if (raceStatusVideoSrc(status) != null) {
        rememberedVideoOpen = true
        rememberedChartOpen = false
        setVideoOpen(true)
        setChartOpen(false)
      }
    }
    rememberedRaceStatus = status
  }, [raceQuery.data?.status])

  useEffect(() => {
    if (!highlightMenuOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (highlightMenuRef.current?.contains(event.target as Node)) return
      setHighlightMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHighlightMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [highlightMenuOpen])

  useEffect(() => {
    appliedParticipantRaceRef.current = null
  }, [selectedParticipant?.participantId])

  useEffect(() => {
    if (selectionRaceId === undefined) return
    rememberedPanelRaceId = selectionRaceId
    rememberedVideoOpen = videoOpen
    rememberedChartOpen = chartOpen
    // Only persist non-empty picks here. Empty/`null` are set by race-change / toggle.
    if (selectedClasses.length > 0) {
      rememberedSelectedClasses = selectedClasses
    }
    // Do not clobber a stored rider with a transient null before timing/restore settles.
    if (selectedKey != null) rememberedSelectedKey = selectedKey
  }, [selectionRaceId, videoOpen, chartOpen, selectedClasses, selectedKey])

  // Once per live race/practice or simulation run: open Chart after any rider completes lap 3.
  const raceMaxLap = timingRows.reduce(
    (max, row) => Math.max(max, row.current_lap_num ?? 0),
    0,
  )
  useEffect(() => {
    if (raceId == null) return
    if (raceMaxLap < AUTO_CHART_AFTER_LAPS) return
    const autoChartKey = simulating ? `sim:${autoChartSimGen}` : `live:${raceId}`
    if (rememberedAutoChartKey === autoChartKey) return
    rememberedAutoChartKey = autoChartKey
    pendingChartRiderKey = null
    rememberedChartOpen = true
    rememberedVideoOpen = false
    setChartOpen(true)
    setVideoOpen(false)
  }, [raceId, simulating, autoChartSimGen, raceMaxLap])

  // Row click before 2 laps: open chart once the remembered rider reaches 2 laps.
  useEffect(() => {
    if (pendingChartRiderKey == null) return
    const row = timingRows.find((entry) => rowKey(entry) === pendingChartRiderKey)
    if (row == null || (row.current_lap_num ?? 0) < CHART_READY_LAPS) return
    pendingChartRiderKey = null
    rememberedChartOpen = true
    rememberedVideoOpen = false
    setChartOpen(true)
    setVideoOpen(false)
  }, [timingRows])

  if (!context) return null

  if (raceQuery.isLoading) {
    return (
      <div className="space-y-5">
        {showParticipantHeader ? (
          <EventParticipantHeader
            eventId={context.eventId}
            eventName={context.eventName}
            pageTitle="Active Race"
            onParticipantChanged={() => {
              appliedParticipantRaceRef.current = null
            }}
          />
        ) : null}
        <Skeleton />
      </div>
    )
  }

  if (raceQuery.error) {
    return (
      <div className="space-y-5">
        {showParticipantHeader ? (
          <EventParticipantHeader
            eventId={context.eventId}
            eventName={context.eventName}
            pageTitle="Active Race"
            onParticipantChanged={() => {
              appliedParticipantRaceRef.current = null
            }}
          />
        ) : null}
        <div className="panel" role="alert">
          <p>{raceQuery.error instanceof Error ? raceQuery.error.message : 'Could not load the live race.'}</p>
          <button
            type="button"
            className="btn mt-4"
            title="Retry loading the live race"
            onClick={() => void raceQuery.refetch()}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const race = raceQuery.data
  if (!race) {
    return (
      <div className="space-y-5">
        {showParticipantHeader ? (
          <EventParticipantHeader
            eventId={context.eventId}
            eventName={context.eventName}
            pageTitle="Active Race"
            onParticipantChanged={() => {
              appliedParticipantRaceRef.current = null
            }}
          />
        ) : null}
        <div className="panel">
          <h1 className="font-display text-4xl font-extrabold uppercase">Races in progress</h1>
          <p className="mt-3 text-lg">No race is staging or on track right now.</p>
          <Link to="/results" className="btn mt-5" title="View completed race results">
            Completed races
          </Link>
        </div>
      </div>
    )
  }

  const sessionLabel = formatLiveSessionLabel(race.session_name, race.is_practice)
  const selectedVisible = classNames.filter((name) => liveSelectedClasses.includes(name))
  const showingMultiple = selectedVisible.length !== 1
  const visibleRows = timingRows
    .filter((row) => selectedVisible.includes(row.class_name))
    .slice()
    .sort((a, b) => compareRows(a, b, sort))
  const sectionLabel =
    selectedVisible.length === 0
      ? null
      : selectedVisible.length === 1
        ? selectedVisible[0]!
        : selectedVisible.join(', ')
  const tableColumns: SortColumn[] = showingMultiple
    ? ['class', 'place', 'plate', 'rider', 'lap', 'lapTime', 'bestLap', 'elapsed', 'leaderGap', 'nextGap', 'status']
    : ['place', 'plate', 'rider', 'lap', 'lapTime', 'bestLap', 'elapsed', 'leaderGap', 'nextGap', 'status']
  const chooseSort = (column: SortColumn) => {
    setSort((current) =>
      current.column === column
        ? { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' },
    )
  }

  function applyClassSelection(next: string[]) {
    rememberedSelectedClasses = next
    setSelectedClasses(next)
    if (next.length !== 1) {
      setSort(DEFAULT_SORT)
    } else if (sort.column === 'class') {
      setSort(PLACE_SORT)
    }
  }

  /** Normal press: show only this class. */
  function selectOnlyClass(name: string) {
    applyClassSelection([name])
  }

  /** Long-press / Shift+click: add this class alongside any already selected. */
  function addClass(name: string) {
    const selected = rememberedSelectedClasses ?? liveSelectedClasses
    const current = classNames.filter((n) => selected.includes(n))
    if (current.includes(name)) return
    applyClassSelection(classNames.filter((n) => current.includes(n) || n === name))
  }

  function classChipPointerHandlers(name: string) {
    return {
      onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0 || event.shiftKey) return
        clearClassLongPress()
        classLongPressOrigin.current = { x: event.clientX, y: event.clientY }
        classLongPressTimer.current = window.setTimeout(() => {
          classLongPressTimer.current = null
          classLongPressOrigin.current = null
          suppressClassClick.current = true
          addClass(name)
        }, CLASS_LONG_PRESS_MS)
      },
      onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => {
        const origin = classLongPressOrigin.current
        if (origin == null) return
        if (
          Math.hypot(event.clientX - origin.x, event.clientY - origin.y) >
          CLASS_LONG_PRESS_MOVE_CANCEL_PX
        ) {
          clearClassLongPress()
        }
      },
      onPointerUp: clearClassLongPress,
      onPointerLeave: clearClassLongPress,
      onPointerCancel: clearClassLongPress,
      onContextMenu: (event: { preventDefault: () => void }) => {
        event.preventDefault()
      },
    }
  }
  const highlighted = highlightRow(visibleRows, highlightMode, selectedParticipant?.participantId ?? null)
  const highlightKey = highlighted ? rowKey(highlighted) : null
  // Defaults when the restored/clicked selection is not in this view:
  // current header participant if in view, else the green highlight row.
  const participantInView =
    selectedParticipant == null
      ? null
      : (visibleRows.find((row) => row.participant_id === selectedParticipant.participantId) ?? null)
  const defaultChartKey = participantInView
    ? rowKey(participantInView)
    : highlightKey
  const selectedInRace =
    liveSelectedKey != null && timingRows.some((row) => rowKey(row) === liveSelectedKey)
  const selectedStillVisible =
    liveSelectedKey != null && visibleRows.some((row) => rowKey(row) === liveSelectedKey)
  // Keep a restored rider while they remain in the race. Wait for timing before replacing.
  const chartKey = selectedStillVisible || selectedInRace
    ? liveSelectedKey
    : timingQuery.isSuccess
      ? defaultChartKey
      : liveSelectedKey
  if (chartKey != null && chartKey !== liveSelectedKey) {
    liveSelectedKey = chartKey
    setSelectedKey(chartKey)
  }
  const chartRow =
    chartKey == null
      ? null
      : (visibleRows.find((row) => rowKey(row) === chartKey) ??
        timingRows.find((row) => rowKey(row) === chartKey) ??
        null)
  const chartPoints = chartRow
    ? lapPointsForParticipant(allTimingRows, chartRow.class_id, chartRow.participant_id)
    : []
  const hasStatusVideo = raceStatusVideoSrc(race.status) != null

  function selectRiderForChart(key: string, laps: number) {
    rememberedSelectedKey = key
    rememberedSelectedClasses = selectedVisible
    setSelectedKey(key)
    if (laps >= CHART_READY_LAPS) {
      pendingChartRiderKey = null
      rememberedChartOpen = true
      rememberedVideoOpen = false
      setChartOpen(true)
      setVideoOpen(false)
      return
    }
    // Fewer than 2 laps: keep selection; open chart once this rider reaches 2 laps.
    pendingChartRiderKey = key
  }

  /** Selecting one panel deselects the other; unselecting leaves the other alone. */
  const toggleChart = () => {
    if (chartOpen) {
      rememberedChartOpen = false
      setChartOpen(false)
      return
    }
    pendingChartRiderKey = null
    rememberedChartOpen = true
    rememberedVideoOpen = false
    setChartOpen(true)
    setVideoOpen(false)
  }
  const toggleVideo = () => {
    if (videoOpen) {
      rememberedVideoOpen = false
      setVideoOpen(false)
      return
    }
    rememberedVideoOpen = true
    rememberedChartOpen = false
    setVideoOpen(true)
    setChartOpen(false)
  }

  return (
    <div className="space-y-5">
      {showParticipantHeader ? (
        <EventParticipantHeader
          eventId={context.eventId}
          eventName={race.event_name || context.eventName}
          pageTitle={
            <span className="inline-flex items-center gap-1.5">
              {formatActiveSessionTitle(race.race_num, race.is_practice)}
              <RaceActivityIcon status={race.status} />
            </span>
          }
          onParticipantChanged={() => {
            appliedParticipantRaceRef.current = null
          }}
        />
      ) : null}
      <header className="!mt-1 border-b border-[#f5c518] pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold leading-tight text-white">
            {sessionLabel ?? formatRaceTitle(race.race_num, race.is_practice, race.race_name)}
          </h1>
          <StatusPill status={race.status} />
          <div className="ml-auto flex items-center gap-2 pr-2">
            <button
              type="button"
              className={`inline-flex h-11 w-11 cursor-pointer items-center justify-center border ${
                chartOpen ? 'border-[#f5c518] bg-[#f5c518] text-black' : 'border-white/30 bg-transparent text-white'
              }`}
              aria-label="Progress tracking chart"
              title={chartOpen ? 'Hide progress chart' : 'Show progress chart'}
              aria-pressed={chartOpen}
              aria-controls="progress-chart"
              onClick={toggleChart}
            >
              <ChartIcon />
            </button>
            {hasStatusVideo ? (
              <button
                type="button"
                className={`inline-flex h-11 w-11 cursor-pointer items-center justify-center border ${
                  videoOpen ? 'border-[#f5c518] bg-[#f5c518] text-black' : 'border-white/30 bg-transparent text-white'
                }`}
                aria-label="Race status video"
                title={videoOpen ? 'Hide status video' : 'Show status video'}
                aria-pressed={videoOpen}
                aria-controls="race-status-video"
                onClick={toggleVideo}
              >
                <VideoIcon />
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {race.status === 'Active' || race.status === 'Paused' || race.status === 'Finished' ? (
            <p className="font-semibold tabular-nums text-zinc-100">Elapsed Time: {elapsedDisplay}</p>
          ) : null}
          {videoOpen ? (
            <button
              type="button"
              className="ml-auto mr-[20%] hidden cursor-pointer bg-transparent p-0 text-sm font-normal text-[#f0d56a] underline underline-offset-2 md:inline"
              title="Hide status video"
              onClick={() => {
                rememberedVideoOpen = false
                setVideoOpen(false)
              }}
            >
              Hide Video
            </button>
          ) : chartOpen ? (
            <button
              type="button"
              className="ml-auto mr-[20%] hidden cursor-pointer bg-transparent p-0 text-sm font-normal text-[#f0d56a] underline underline-offset-2 md:inline"
              title="Hide progress chart"
              onClick={() => {
                rememberedChartOpen = false
                setChartOpen(false)
              }}
            >
              Hide Chart
            </button>
          ) : null}
        </div>
        {videoOpen ? (
          <div
            className="select-none touch-manipulation [&_*]:select-none"
            title="Long-press to hide video"
            {...hideMediaLongPressHandlers('video')}
          >
            <RaceStatusVideo status={race.status} showVideo={videoOpen} />
          </div>
        ) : null}
        {chartOpen ? (
          <div
            id="progress-chart"
            className="mt-4 max-md:-mx-4 select-none touch-manipulation [&_*]:select-none"
            title="Long-press to hide chart"
            {...hideMediaLongPressHandlers('chart')}
          >
            <ProgressTrackingChart
              riderLabel={chartRow ? `${riderName(chartRow.first_name, chartRow.last_name)} · ${chartRow.class_name}` : ''}
              points={chartPoints}
              throughLap={chartRow?.current_lap_num}
            />
          </div>
        ) : null}
        {classNames.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <div className="contents" role="group" aria-label="Race classes">
              {classNames.map((name) => {
                const selected = selectedVisible.includes(name)
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={selected}
                    title={`${name}: click to show only this class; Shift+click or long-press to add`}
                    className={`min-h-8 cursor-pointer touch-manipulation select-none border px-2 py-0.5 text-xs font-semibold uppercase leading-tight ${
                      selected ? 'border-[#f5c518] bg-[#f5c518] text-black' : 'border-white/20 bg-transparent text-white'
                    }`}
                    onClick={(event) => {
                      if (suppressClassClick.current) {
                        suppressClassClick.current = false
                        return
                      }
                      if (event.shiftKey) {
                        addClass(name)
                        return
                      }
                      selectOnlyClass(name)
                    }}
                    {...classChipPointerHandlers(name)}
                  >
                    {name}
                  </button>
                )
              })}
            </div>
            <div className="relative ml-auto shrink-0" ref={highlightMenuRef}>
              <button
                type="button"
                className="inline-flex min-h-8 cursor-pointer items-center bg-[#c9efd4] px-2 text-xs font-bold text-black"
                aria-haspopup="listbox"
                aria-expanded={highlightMenuOpen}
                title="Choose which row gets the green highlight"
                onClick={() => setHighlightMenuOpen((open) => !open)}
              >
                {HIGHLIGHT_LABELS[highlightMode]}
              </button>
              {highlightMenuOpen ? (
                <ul
                  role="listbox"
                  aria-label="Green row highlight"
                  className="absolute right-0 z-20 mt-1 min-w-[11rem] border border-white/20 bg-[#1a1a1a] py-1 shadow-lg"
                >
                  {(Object.keys(HIGHLIGHT_LABELS) as HighlightMode[]).map((mode) => (
                    <li key={mode} role="option" aria-selected={highlightMode === mode}>
                      <button
                        type="button"
                        className={`block w-full cursor-pointer whitespace-nowrap px-3 py-2 text-left text-sm font-bold ${
                          highlightMode === mode ? 'bg-[#c9efd4] text-black' : 'text-white hover:bg-white/10'
                        }`}
                        title={`Highlight ${HIGHLIGHT_MENU_LABELS[mode]}`}
                        onClick={() => {
                          setHighlightMode(mode)
                          setHighlightMenuOpen(false)
                        }}
                      >
                        {HIGHLIGHT_MENU_LABELS[mode]}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ) : null}
      </header>

      {timingQuery.isLoading ? <Skeleton /> : null}
      {timingQuery.error ? (
        <div className="panel" role="alert">
          <p>{timingQuery.error instanceof Error ? timingQuery.error.message : 'Could not load timing.'}</p>
          <button
            type="button"
            className="btn mt-4"
            title="Retry loading timing"
            onClick={() => void timingQuery.refetch()}
          >
            Retry
          </button>
        </div>
      ) : null}
      {!timingQuery.isLoading && !timingQuery.error && classNames.length === 0 ? (
        <p className="panel">No timing rows for this race yet.</p>
      ) : null}

      {!timingQuery.isLoading && !timingQuery.error && selectedVisible.length > 0 ? (
        <section aria-label={sectionLabel ?? undefined}>
          {visibleRows.length === 0 ? (
            <p className="panel">
              {selectedVisible.length === 1
                ? 'No timing rows for this class yet.'
                : 'No timing rows for the selected classes yet.'}
            </p>
          ) : (
            <div className="table-wrap table-wrap-live">
              <table className="data">
                <thead>
                  <tr>
                    {tableColumns.map((column) => (
                      <SortHeader key={column} column={column} sort={sort} onSort={chooseSort} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const key = rowKey(row)
                    const selected = key === liveSelectedKey
                    const isLeader = key === highlightKey
                    const className = ['is-selectable', selected ? 'is-selected' : '', isLeader ? 'is-leader' : '']
                      .filter(Boolean)
                      .join(' ')
                    const cells: Record<SortColumn, string> = {
                      class: row.class_name,
                      place: row.place_num ?? '—',
                      plate: row.participant_plate || '—',
                      rider: riderName(row.first_name, row.last_name),
                      lap: row.current_lap_num == null ? '—' : String(row.current_lap_num),
                      lapTime: formatRaceTime(row.current_lap_time),
                      bestLap: bestLapLabel(row.best_lap_num, row.best_lap_time),
                      elapsed: formatRaceTime(row.race_elapsed_time),
                      leaderGap: formatRaceTime(row.leader_gap_time),
                      nextGap: formatRaceTime(row.next_gap_time),
                      status: row.status || '—',
                    }
                    return (
                      <tr
                        key={key}
                        className={className}
                        tabIndex={0}
                        aria-selected={selected}
                        title={`Select ${riderName(row.first_name, row.last_name)} for the chart`}
                        onClick={() => {
                          selectRiderForChart(key, row.current_lap_num ?? 0)
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return
                          event.preventDefault()
                          selectRiderForChart(key, row.current_lap_num ?? 0)
                        }}
                      >
                        {tableColumns.map((column) => (
                          <td key={column}>{cells[column]}</td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
      {!timingQuery.isLoading && !timingQuery.error && classNames.length > 0 && selectedVisible.length === 0 ? (
        <p className="panel">Select one or more classes to view timing.</p>
      ) : null}
    </div>
  )
}
