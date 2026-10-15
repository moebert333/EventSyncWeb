import { Link, Navigate } from 'react-router-dom'
import { Skeleton } from '../components/Skeleton'
import { StatusPill } from '../components/StatusPill'
import { useEventCode } from '../hooks/useEventCode'
import { useLiveTiming, useRaceClassNames, useRaceInProgress } from '../hooks/useRaceInProgress'
import { bestLapLabel, formatClock, formatEventDate, formatRaceTime, placeRank, riderName } from '../lib/format'
import type { ActiveRaceTiming, RaceStatus } from '../types/database'

const LIVE: RaceStatus[] = ['Staging', 'Active', 'Paused']

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

export function RacesInProgressPage() {
  const { context } = useEventCode()
  const raceQuery = useRaceInProgress(context?.eventId ?? null, context?.seriesId ?? null)
  const live = raceQuery.data?.status != null && LIVE.includes(raceQuery.data.status)
  const timingQuery = useLiveTiming(raceQuery.data)
  const classQuery = useRaceClassNames(raceQuery.data?.race_id ?? null, live)

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
  const groups = groupByClass(timingQuery.data ?? [])
  const classNames = (classQuery.data ?? []).map((row) => row.class_name)
  const uniqueClasses = [...new Set(classNames)]

  return (
    <div className="space-y-5">
      <header className="border-b border-[#f5c518] pb-4">
        <p className="text-sm uppercase tracking-widest text-zinc-400">{race.event_name}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl font-extrabold uppercase">Race {race.race_num}</h1>
          <StatusPill status={race.status} />
        </div>
        <p className="mt-2 text-zinc-300">
          {race.session_name}
          {when ? ` · ${when}` : ''}
        </p>
        {race.event_id !== context.eventId ? (
          <p className="mt-2 text-sm text-zinc-400">Showing the live race for this series.</p>
        ) : null}
        {uniqueClasses.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {uniqueClasses.map((name) => (
              <li key={name} className="border border-white/20 px-3 py-2 text-sm font-semibold uppercase">
                {name}
              </li>
            ))}
          </ul>
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
      {!timingQuery.isLoading && !timingQuery.error && groups.size === 0 ? (
        <p className="panel">No timing rows for this race yet.</p>
      ) : null}

      {[...groups.entries()].map(([className, rows]) => (
        <section key={className}>
          <h2 className="font-display text-2xl font-bold uppercase">{className}</h2>
          <div className="table-wrap mt-2">
            <table className="data">
              <thead>
                <tr>
                  <th>Place</th>
                  <th>Plate</th>
                  <th>Rider</th>
                  <th>Class</th>
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
                {rows.map((row) => (
                  <tr key={`${row.class_id}-${row.participant_id}`}>
                    <td>{row.place_num ?? '—'}</td>
                    <td>{row.participant_plate || '—'}</td>
                    <td>{riderName(row.first_name, row.last_name)}</td>
                    <td>{row.class_name}</td>
                    <td>{row.current_lap_num ?? '—'}</td>
                    <td>{formatRaceTime(row.current_lap_time)}</td>
                    <td>{bestLapLabel(row.best_lap_num, row.best_lap_time)}</td>
                    <td>{formatRaceTime(row.race_elapsed_time)}</td>
                    <td>{formatRaceTime(row.leader_gap_time)}</td>
                    <td>{formatRaceTime(row.next_gap_time)}</td>
                    <td>{row.status || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}
