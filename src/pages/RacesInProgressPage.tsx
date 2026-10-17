import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ChartIcon, ProgressTrackingChart } from '../components/ProgressChart'
import { RaceStatusVideo, VideoIcon, raceStatusVideoSrc } from '../components/RaceStatusVideo'
import { Skeleton } from '../components/Skeleton'
import { StatusPill } from '../components/StatusPill'
import { useEventCode } from '../hooks/useEventCode'
import { useLiveTiming, useRaceClassNames, useRaceInProgress } from '../hooks/useRaceInProgress'
import { useElapsedRaceClock } from '../hooks/useElapsedRaceClock'
import {
  bestLapLabel,
  formatClock,
  formatEventDate,
  formatRaceTime,
  placeRank,
  raceTimeSeconds,
  riderName,
} from '../lib/format'
import { progressKey, recordLapProgress, type RaceLapProgress } from '../lib/progressTracking'
import type { ActiveRaceTiming, RaceStatus } from '../types/database'

const LIVE: RaceStatus[] = ['Staging', 'Active', 'Paused']
const EMPTY_PROGRESS: RaceLapProgress = {}

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
function leadRow(rows: ActiveRaceTiming[]): ActiveRaceTiming | null {
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

export function RacesInProgressPage() {
  const { context } = useEventCode()
  const raceQuery = useRaceInProgress(context?.eventId ?? null, context?.seriesId ?? null)
  const live = raceQuery.data?.status != null && LIVE.includes(raceQuery.data.status)
  const timingQuery = useLiveTiming(raceQuery.data)
  const classQuery = useRaceClassNames(raceQuery.data?.race_id ?? null, live)
  const elapsedDisplay = useElapsedRaceClock(
    raceQuery.data?.elapsed_race_time,
    raceQuery.data?.status === 'Active',
  )
  const raceId = raceQuery.data?.race_id ?? null
  const timingRows = timingQuery.data ?? []
  const groups = groupByClass(timingRows)
  const classNames = classNamesFor(
    (classQuery.data ?? []).map((row) => row.class_name),
    [...groups.keys()],
  )
  /**
   * Unset until the first successful load. That race is already on track when
   * the page is opened, so it does not open the video. A later race id change does.
   */
  const [selectionRaceId, setSelectionRaceId] = useState<number | null | undefined>(undefined)
  const [pickedClass, setPickedClass] = useState<string | null>(null)
  const [allClasses, setAllClasses] = useState(false)
  const [sort, setSort] = useState<SortState>(PLACE_SORT)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [chartOpen, setChartOpen] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)

  if (raceQuery.isSuccess && selectionRaceId !== raceId) {
    const pageJustOpened = selectionRaceId === undefined
    setSelectionRaceId(raceId)
    setPickedClass(null)
    setAllClasses(false)
    setSort(PLACE_SORT)
    setSelectedKey(null)
    setChartOpen(false)
    if (!pageJustOpened) {
      setVideoOpen(raceStatusVideoSrc(raceQuery.data?.status) != null)
    }
  }

  const progress = raceId == null ? EMPTY_PROGRESS : recordLapProgress(raceId, timingRows)

  if (!context) return <Navigate to="/?needCode=1" replace />

  if (raceQuery.isLoading) return <Skeleton />

  if (raceQuery.error) {
    return (
      <div className="panel" role="alert">
        <p>{raceQuery.error instanceof Error ? raceQuery.error.message : 'Could not load the live race.'}</p>
        <button type="button" className="btn mt-4" onClick={() => void raceQuery.refetch()}>
          Retry
        </button>
      </div>
    )
  }

  const race = raceQuery.data
  if (!race) {
    return (
      <div className="panel">
        <h1 className="font-display text-4xl font-extrabold uppercase">Races in progress</h1>
        <p className="mt-3 text-lg">No race is staging or on track right now.</p>
        <Link to="/results" className="btn mt-5">
          Completed races
        </Link>
      </div>
    )
  }

  const when = [formatEventDate(race.race_date), formatClock(race.race_start)].filter(Boolean).join(' · ')
  const showingAll = allClasses && classNames.length > 0
  const activeClass = showingAll
    ? null
    : pickedClass != null && classNames.includes(pickedClass)
      ? pickedClass
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
  const selectedRow = visibleRows.find((row) => rowKey(row) === selectedKey) ?? null
  const chartRow = selectedRow ?? visibleRows[0] ?? null
  const chartPoints = chartRow ? (progress[progressKey(chartRow.class_id, chartRow.participant_id)] ?? []) : []
  const leader = leadRow(visibleRows)
  const leaderKey = leader ? rowKey(leader) : null
  const hasStatusVideo = raceStatusVideoSrc(race.status) != null
  /** Selecting one panel deselects the other; unselecting leaves the other alone. */
  const toggleChart = () => {
    if (chartOpen) {
      setChartOpen(false)
      return
    }
    setChartOpen(true)
    setVideoOpen(false)
  }
  const toggleVideo = () => {
    if (videoOpen) {
      setVideoOpen(false)
      return
    }
    setVideoOpen(true)
    setChartOpen(false)
  }

  return (
    <div className="space-y-5">
      <header className="border-b border-[#f5c518] pb-4">
        <p className="text-lg font-bold">Event Name: {race.event_name}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl font-extrabold uppercase">Race {race.race_num}</h1>
          <StatusPill status={race.status} />
          <button
            type="button"
            className={`inline-flex h-11 w-11 cursor-pointer items-center justify-center border ${
              chartOpen ? 'border-[#f5c518] bg-[#f5c518] text-black' : 'border-white/30 bg-transparent text-white'
            }`}
            aria-label="Progress tracking chart"
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
              aria-pressed={videoOpen}
              aria-controls="race-status-video"
              onClick={toggleVideo}
            >
              <VideoIcon />
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-zinc-300">
          {race.session_name}
          {when ? ` · ${when}` : ''}
        </p>
        {race.event_id !== context.eventId ? (
          <p className="mt-2 text-sm text-zinc-400">Showing the live race for this series.</p>
        ) : null}
        <RaceStatusVideo status={race.status} showVideo={videoOpen} />
        {chartOpen ? (
          <div id="progress-chart" className="mt-4">
            <ProgressTrackingChart
              riderLabel={chartRow ? `${riderName(chartRow.first_name, chartRow.last_name)} · ${chartRow.class_name}` : ''}
              points={chartPoints}
            />
          </div>
        ) : null}
        {classNames.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Race classes">
            {classNames.map((name) => {
              const selected = name === activeClass
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={selected}
                  className={`min-h-11 cursor-pointer border px-3 py-2 text-sm font-semibold uppercase ${
                    selected ? 'border-[#f5c518] bg-[#f5c518] text-black' : 'border-white/20 bg-transparent text-white'
                  }`}
                  onClick={() => {
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
              className={`min-h-11 cursor-pointer border px-3 py-2 text-sm font-semibold uppercase ${
                showingAll ? 'border-[#f5c518] bg-[#f5c518] text-black' : 'border-white/20 bg-transparent text-white'
              }`}
              onClick={() => {
                setAllClasses(true)
                setSort(DEFAULT_SORT)
              }}
            >
              All Classes
            </button>
          </div>
        ) : null}
      </header>

      {timingQuery.isLoading ? <Skeleton /> : null}
      {timingQuery.error ? (
        <div className="panel" role="alert">
          <p>{timingQuery.error instanceof Error ? timingQuery.error.message : 'Could not load timing.'}</p>
          <button type="button" className="btn mt-4" onClick={() => void timingQuery.refetch()}>
            Retry
          </button>
        </div>
      ) : null}
      {!timingQuery.isLoading && !timingQuery.error && classNames.length === 0 ? (
        <p className="panel">No timing rows for this race yet.</p>
      ) : null}

      {!timingQuery.isLoading && !timingQuery.error && (showingAll || activeClass) ? (
        <section aria-label={sectionLabel ?? undefined}>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-2xl font-bold uppercase">{sectionLabel}</h2>
            <p className="text-lg font-semibold tabular-nums">
              Elapsed Time: {elapsedDisplay}
            </p>
            <span className="ml-auto inline-flex min-h-8 items-center bg-[#c9efd4] px-3 text-sm font-bold text-black">
              Best Lap Time
            </span>
          </div>
          {visibleRows.length === 0 ? (
            <p className="panel mt-2">{showingAll ? 'No timing rows yet.' : 'No timing rows for this class yet.'}</p>
          ) : (
            <div className="table-wrap mt-2">
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
                    const selected = key === selectedKey
                    const isLeader = key === leaderKey
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
                        onClick={() => {
                          setSelectedKey(key)
                          setChartOpen(true)
                          setVideoOpen(false)
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return
                          event.preventDefault()
                          setSelectedKey(key)
                          setChartOpen(true)
                          setVideoOpen(false)
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
