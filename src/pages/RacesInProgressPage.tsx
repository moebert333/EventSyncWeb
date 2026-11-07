import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ChartIcon, ProgressTrackingChart } from '../components/ProgressChart'
import { EventParticipantHeader } from '../components/EventParticipantHeader'
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
  formatRaceTitle,
  formatSessionName,
  placeRank,
  raceTimeSeconds,
  riderName,
} from '../lib/format'
import { lapPointsForParticipant, latestTimingRows } from '../lib/progressTracking'
import type { ActiveRaceTiming, RaceStatus } from '../types/database'

/** Typical mobile long-press (Material / iOS context-menu range). */
const HIDE_MEDIA_LONG_PRESS_MS = 500
const HIDE_MEDIA_MOVE_CANCEL_PX = 12

type HighlightMode = 'firstPlace' | 'bestLap' | 'participant'

const HIGHLIGHT_LABELS: Record<HighlightMode, string> = {
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
let rememberedPickedClass: string | null = null
let rememberedAllClasses = false
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

const AUTO_CHART_AFTER_LAPS = 3

export function RacesInProgressPage() {
  const { context, selectedParticipant } = useEventCode()
  const simulation = useSimulationOptional()
  const simulating = Boolean(simulation?.isActive)
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
  const allTimingRows = timingQuery.data ?? []
  /** Live table shows only the latest lap per class + participant. */
  const timingRows = latestTimingRows(allTimingRows)
  const groups = groupByClass(timingRows)
  const classNames = classNamesFor(
    (classQuery.data ?? []).map((row) => row.class_name),
    [...groups.keys()],
  )
  /** Unset until the first successful load; then tracks the shown race id. */
  const [selectionRaceId, setSelectionRaceId] = useState<number | null | undefined>(undefined)
  const [pickedClass, setPickedClass] = useState<string | null>(() => rememberedPickedClass)
  const [allClasses, setAllClasses] = useState(() => rememberedAllClasses)
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

  function clearHideLongPress() {
    if (hideLongPressTimer.current != null) {
      window.clearTimeout(hideLongPressTimer.current)
      hideLongPressTimer.current = null
    }
    hideLongPressOrigin.current = null
  }

  function hideMedia(kind: 'chart' | 'video') {
    if (kind === 'chart') {
      rememberedChartOpen = false
      setChartOpen(false)
      return
    }
    rememberedVideoOpen = false
    setVideoOpen(false)
  }

  function hideMediaLongPressHandlers(kind: 'chart' | 'video') {
    return {
      onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return
        clearHideLongPress()
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
    }
  }

  // Local copies so same-render chart/selection logic sees restored values (setState is async).
  let liveSelectedKey = selectedKey
  let livePickedClass = pickedClass
  let liveAllClasses = allClasses

  if (raceQuery.isSuccess && selectionRaceId !== raceId) {
    const eventId = context?.eventId ?? null
    const raceChanged =
      rememberedPanelEventId !== eventId || rememberedPanelRaceId !== raceId
    setSelectionRaceId(raceId)
    // Keep last class chip (or none → UI falls back to first class); do not jump to the participant's class.
    livePickedClass = rememberedPickedClass
    liveAllClasses = rememberedAllClasses
    liveSelectedKey = rememberedSelectedKey
    setPickedClass(livePickedClass)
    setAllClasses(liveAllClasses)
    setSort(PLACE_SORT)
    setSelectedKey(liveSelectedKey)
    // Always restore last chart/video view on remount; status changes switch to Video separately.
    setChartOpen(rememberedChartOpen)
    setVideoOpen(rememberedVideoOpen)
    appliedParticipantRaceRef.current = null
    if (raceChanged) {
      rememberedPanelEventId = eventId
      rememberedPanelRaceId = raceId
    }
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
    rememberedPickedClass = pickedClass
    rememberedAllClasses = allClasses
    // Do not clobber a stored rider with a transient null before timing/restore settles.
    if (selectedKey != null) rememberedSelectedKey = selectedKey
  }, [selectionRaceId, videoOpen, chartOpen, pickedClass, allClasses, selectedKey])

  if (!context) return <Navigate to="/?needCode=1" replace />

  if (raceQuery.isLoading) {
    return (
      <div className="space-y-5">
        {!simulating ? (
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
        {!simulating ? (
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
        {!simulating ? (
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

  const sessionLabel = formatSessionName(race.session_name, true)
  const showingAll = liveAllClasses && classNames.length > 0
  const activeClass = showingAll
    ? null
    : livePickedClass != null && classNames.includes(livePickedClass)
      ? livePickedClass
      : (classNames[0] ?? null)
  const classRows = activeClass ? (groups.get(activeClass) ?? []) : []
  const visibleRows = (showingAll ? timingRows : classRows).slice().sort((a, b) => compareRows(a, b, sort))
  const sectionLabel = showingAll ? 'All Classes' : activeClass
  const tableColumns: SortColumn[] = showingAll
    ? ['class', 'place', 'plate', 'rider', 'lap', 'lapTime', 'bestLap', 'elapsed', 'leaderGap', 'nextGap', 'status']
    : ['place', 'plate', 'rider', 'lap', 'lapTime', 'bestLap', 'elapsed', 'leaderGap', 'nextGap', 'status']
  const chooseSort = (column: SortColumn) => {
    setSort((current) =>
      current.column === column
        ? { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' },
    )
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
  // Once per live race/practice or simulation: open chart after 3 laps are shown.
  const autoChartKey = simulating ? `sim:${autoChartSimGen}` : `live:${race.race_id}`
  if (chartPoints.length >= AUTO_CHART_AFTER_LAPS && rememberedAutoChartKey !== autoChartKey) {
    rememberedAutoChartKey = autoChartKey
    if (!chartOpen) {
      rememberedChartOpen = true
      rememberedVideoOpen = false
      setChartOpen(true)
      setVideoOpen(false)
    }
  }
  const hasStatusVideo = raceStatusVideoSrc(race.status) != null
  /** Selecting one panel deselects the other; unselecting leaves the other alone. */
  const toggleChart = () => {
    if (chartOpen) {
      rememberedChartOpen = false
      setChartOpen(false)
      return
    }
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
      {!simulating ? (
        <EventParticipantHeader
          eventId={context.eventId}
          eventName={race.event_name || context.eventName}
          pageTitle={race.is_practice ? 'Active Practice' : 'Active Race'}
          onParticipantChanged={() => {
            appliedParticipantRaceRef.current = null
          }}
        />
      ) : null}
      <header className="border-b border-[#f5c518] pb-4">
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl font-extrabold uppercase">
            {formatRaceTitle(race.race_num, race.is_practice, race.race_name)}
          </h1>
          <StatusPill status={race.status} />
          <div className="ml-auto flex items-center gap-3 pr-2">
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
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-zinc-300">
            {sessionLabel}
            {race.status === 'Active' || race.status === 'Paused' || race.status === 'Finished' ? (
              <>
                {sessionLabel ? ' · ' : ''}
                <span className="font-semibold tabular-nums text-zinc-100">Elapsed Time: {elapsedDisplay}</span>
              </>
            ) : null}
          </p>
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
            className="select-none touch-manipulation"
            title="Long-press to hide video"
            {...hideMediaLongPressHandlers('video')}
          >
            <RaceStatusVideo status={race.status} showVideo={videoOpen} />
          </div>
        ) : null}
        {chartOpen ? (
          <div
            id="progress-chart"
            className="mt-4 max-md:-mx-4 select-none touch-manipulation"
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
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="contents" role="group" aria-label="Race classes">
              {classNames.map((name) => {
                const selected = name === activeClass
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={selected}
                    title={`Show ${name} timing`}
                    className={`min-h-11 cursor-pointer border px-3 py-2 text-sm font-semibold uppercase ${
                      selected ? 'border-[#f5c518] bg-[#f5c518] text-black' : 'border-white/20 bg-transparent text-white'
                    }`}
                    onClick={() => {
                      rememberedAllClasses = false
                      rememberedPickedClass = name
                      setAllClasses(false)
                      setPickedClass(name)
                      setSort((current) => (current.column === 'class' ? PLACE_SORT : current))
                    }}
                  >
                    {name}
                  </button>
                )
              })}
              <button
                type="button"
                aria-pressed={showingAll}
                title="Show timing for all classes"
                className={`min-h-11 cursor-pointer border px-3 py-2 text-sm font-semibold uppercase ${
                  showingAll ? 'border-[#f5c518] bg-[#f5c518] text-black' : 'border-white/20 bg-transparent text-white'
                }`}
                onClick={() => {
                  rememberedAllClasses = true
                  setAllClasses(true)
                  setSort(DEFAULT_SORT)
                }}
              >
                All Classes
              </button>
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
                  className="absolute right-0 z-20 mt-1 min-w-full border border-white/20 bg-[#1a1a1a] py-1 shadow-lg"
                >
                  {(Object.keys(HIGHLIGHT_LABELS) as HighlightMode[]).map((mode) => (
                    <li key={mode} role="option" aria-selected={highlightMode === mode}>
                      <button
                        type="button"
                        className={`block w-full cursor-pointer px-3 py-2 text-left text-sm font-bold ${
                          highlightMode === mode ? 'bg-[#c9efd4] text-black' : 'text-white hover:bg-white/10'
                        }`}
                        title={`Highlight ${HIGHLIGHT_LABELS[mode]}`}
                        onClick={() => {
                          setHighlightMode(mode)
                          setHighlightMenuOpen(false)
                        }}
                      >
                        {HIGHLIGHT_LABELS[mode]}
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

      {!timingQuery.isLoading && !timingQuery.error && (showingAll || activeClass) ? (
        <section aria-label={sectionLabel ?? undefined}>
          {visibleRows.length === 0 ? (
            <p className="panel">{showingAll ? 'No timing rows yet.' : 'No timing rows for this class yet.'}</p>
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
                          rememberedSelectedKey = key
                          if (!showingAll && activeClass) {
                            rememberedPickedClass = activeClass
                            rememberedAllClasses = false
                          }
                          setSelectedKey(key)
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return
                          event.preventDefault()
                          rememberedSelectedKey = key
                          if (!showingAll && activeClass) {
                            rememberedPickedClass = activeClass
                            rememberedAllClasses = false
                          }
                          setSelectedKey(key)
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
    </div>
  )
}
