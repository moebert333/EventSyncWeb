import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ChartIcon, ProgressTrackingChart } from '../components/ProgressChart'
import { RaceStatusVideo, VideoIcon, raceStatusVideoSrc } from '../components/RaceStatusVideo'
import { Skeleton } from '../components/Skeleton'
import { StatusPill } from '../components/StatusPill'
import { useEventCode } from '../hooks/useEventCode'
import { useLiveTiming, useRaceClassNames, useRaceInProgress } from '../hooks/useRaceInProgress'
import {
  bestLapLabel,
  formatClock,
  formatElapsedRaceTime,
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
  const raceId = raceQuery.data?.race_id ?? null
  const timingRows = timingQuery.data ?? []
  const groups = groupByClass(timingRows)
  const classNames = classNamesFor(
    (classQuery.data ?? []).map((row) => row.class_name),
    [...groups.keys()],
  )
  /** Starts unset so the first loaded race (including cached) applies initial video/chart state. */
  const [selectionRaceId, setSelectionRaceId] = useState<number | null | undefined>(undefined)
  const [pickedClass, setPickedClass] = useState<string | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [chartOpen, setChartOpen] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)

  if (selectionRaceId !== raceId) {
    setSelectionRaceId(raceId)
    setPickedClass(null)
    setSelectedKey(null)
    setChartOpen(false)
    setVideoOpen(raceStatusVideoSrc(raceQuery.data?.status) != null)
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
  const activeClass = pickedClass != null && classNames.includes(pickedClass) ? pickedClass : (classNames[0] ?? null)
  const visibleRows = activeClass ? (groups.get(activeClass) ?? []) : []
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
                  onClick={() => setPickedClass(name)}
                >
                  {name}
                </button>
              )
            })}
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

      {!timingQuery.isLoading && !timingQuery.error && activeClass ? (
        <section aria-label={activeClass}>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-2xl font-bold uppercase">{activeClass}</h2>
            <p className="text-lg font-semibold tabular-nums">
              Elapsed Time: {formatElapsedRaceTime(race.elapsed_race_time)}
            </p>
            <span className="ml-auto inline-flex min-h-8 items-center bg-[#c9efd4] px-3 text-sm font-bold text-black">
              Best Lap Time
            </span>
          </div>
          {visibleRows.length === 0 ? (
            <p className="panel mt-2">No timing rows for this class yet.</p>
          ) : (
            <div className="table-wrap mt-2">
              <table className="data">
                <thead>
                  <tr>
                    <th>Place</th>
                    <th>Plate</th>
                    <th>Rider</th>
                    <th>Lap</th>
                    <th>Current lap</th>
                    <th>Best lap</th>
                    <th>Elapsed</th>
                    <th>Gap to leader</th>
                    <th>Gap to next</th>
                    <th>Status</th>
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
                    return (
                      <tr
                        key={key}
                        className={className}
                        tabIndex={0}
                        aria-selected={selected}
                        onClick={() => setSelectedKey(key)}
                        onDoubleClick={toggleChart}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return
                          event.preventDefault()
                          setSelectedKey(key)
                        }}
                      >
                        <td>{row.place_num ?? '—'}</td>
                        <td>{row.participant_plate || '—'}</td>
                        <td>{riderName(row.first_name, row.last_name)}</td>
                        <td>{row.current_lap_num ?? '—'}</td>
                        <td>{formatRaceTime(row.current_lap_time)}</td>
                        <td>{bestLapLabel(row.best_lap_num, row.best_lap_time)}</td>
                        <td>{formatRaceTime(row.race_elapsed_time)}</td>
                        <td>{formatRaceTime(row.leader_gap_time)}</td>
                        <td>{formatRaceTime(row.next_gap_time)}</td>
                        <td>{row.status || '—'}</td>
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
