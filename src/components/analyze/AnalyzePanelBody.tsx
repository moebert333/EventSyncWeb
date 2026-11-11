import { useEffect, useMemo, useState } from 'react'
import {
  headToHeadPlaces,
  type AnalyzeSnapshot,
} from '../../lib/analyzeMetrics'
import type { AnalyzePanelId } from '../../lib/analyzePanels'
import type { EventClassResult } from '../../types/database'
import { SimpleBarChart, SimpleLineChart, SimplePieChart } from './SimpleCharts'

type Props = {
  panelId: AnalyzePanelId
  snapshot: AnalyzeSnapshot
  rows: EventClassResult[]
  /** Header focus class — Standings defaults here but can diverge. */
  focusClassName: string | null
  standingsClass: string | null
  onStandingsClassChange: (className: string) => void
}

function fmt(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return Number.isInteger(n) ? String(n) : n.toFixed(digits)
}

function NoResults() {
  return <p className="flex min-h-[180px] items-center justify-center text-sm text-zinc-500">No Results</p>
}

/** All riders with series points (excludes 0-point entries). */
function standingsRowsForDisplay<T extends { points: number }>(
  standings: T[],
): { row: T; rank: number }[] {
  return standings
    .filter((row) => row.points > 0)
    .map((row, index) => ({ row, rank: index + 1 }))
}

export function AnalyzePanelBody({
  panelId,
  snapshot,
  rows,
  focusClassName,
  standingsClass,
  onStandingsClassChange,
}: Props) {
  const hasRiderResults = snapshot.riderResults.length > 0
  const [rivalId, setRivalId] = useState<number | null>(null)

  useEffect(() => {
    setRivalId(snapshot.headToHeadOptions[0]?.participantId ?? null)
  }, [snapshot.headToHeadOptions, focusClassName])

  const standings = standingsClass ? (snapshot.standingsByClass[standingsClass] ?? []) : []
  const h2h = useMemo(
    () => headToHeadPlaces(snapshot, rows, rivalId),
    [snapshot, rows, rivalId],
  )

  if (panelId === 'placeOverTime') {
    if (!hasRiderResults) return <NoResults />
    const seasonAvg = snapshot.placeOverTime.seasonAvg
    const placeValues = [
      ...snapshot.placeOverTime.rider,
      ...snapshot.placeOverTime.classAvg,
      ...(seasonAvg != null ? [seasonAvg] : []),
    ].filter((n) => Number.isFinite(n) && n > 0)
    const dataMin = placeValues.length ? Math.min(...placeValues) : 1
    const dataMax = placeValues.length ? Math.max(...placeValues) : 5
    const yMin = Math.max(1, dataMin * 0.9)
    const yMax = Math.max(yMin + 0.1, dataMax * 1.1)
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col gap-2">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-300">
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 bg-[#38bdf8]" aria-hidden />
            You
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 bg-[#71717a]" aria-hidden />
            Class avg
          </li>
          {seasonAvg != null ? (
            <li className="flex items-center gap-1.5">
              <span
                className="inline-block h-0 w-4 border-t border-dashed border-[#4ade80]"
                aria-hidden
              />
              Season avg
            </li>
          ) : null}
          <li className="text-zinc-500">Lower place is better</li>
        </ul>
        <div className="min-h-0 flex-1">
          <SimpleLineChart
            categories={snapshot.placeOverTime.labels}
            series={[
              { name: 'You', data: snapshot.placeOverTime.rider, color: '#38bdf8' },
              { name: 'Class avg', data: snapshot.placeOverTime.classAvg, color: '#71717a' },
            ]}
            height={280}
            className="h-full w-full"
            invertY
            yMin={yMin}
            yMax={yMax}
            hideReferenceLabel
            reference={
              seasonAvg != null ? { value: seasonAvg, label: 'Season avg' } : undefined
            }
          />
        </div>
      </div>
    )
  }

  if (panelId === 'finishDistribution') {
    if (!hasRiderResults) return <NoResults />
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <SimplePieChart data={snapshot.finishDistribution} />
      </div>
    )
  }

  if (panelId === 'seriesStandings') {
    const scoredStandings = standingsRowsForDisplay(standings)
    return (
      <div className="space-y-3">
        <label className="block text-xs uppercase tracking-wide text-zinc-400">
          Class
          <select
            className="control mt-1"
            value={standingsClass ?? ''}
            onChange={(event) => onStandingsClassChange(event.target.value)}
          >
            {snapshot.classNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {scoredStandings.length === 0 ? (
          <NoResults />
        ) : (
          <div className="max-h-52 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-[#1a1a1a] text-xs uppercase text-zinc-500">
                <tr>
                  <th className="py-1 pr-2">#</th>
                  <th className="py-1 pr-2">Rider</th>
                  <th className="py-1 pr-2 text-right">Pts</th>
                  <th className="py-1 pr-2 text-right">Ev</th>
                  <th className="py-1 text-right">Avg</th>
                </tr>
              </thead>
              <tbody>
                {scoredStandings.map(({ row, rank }) => (
                  <tr
                    key={row.participantId}
                    className={row.isYou ? 'bg-sky-500/15 text-sky-200' : 'text-zinc-200'}
                  >
                    <td className="py-1 pr-2">{rank}</td>
                    <td className="py-1 pr-2">
                      {row.name}
                      {row.isYou ? ' (you)' : ''}
                    </td>
                    <td className="py-1 pr-2 text-right">{row.points}</td>
                    <td className="py-1 pr-2 text-right">{row.events}</td>
                    <td className="py-1 text-right">{fmt(row.avgPlace)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  if (panelId === 'pointsAccumulation') {
    if (!hasRiderResults) return <NoResults />
    return (
      <div className="space-y-2">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-300">
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 bg-[#38bdf8]" aria-hidden />
            You
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 bg-[#fbbf24]" aria-hidden />
            Leader
          </li>
        </ul>
        <SimpleLineChart
          categories={snapshot.pointsAccumulation.labels}
          series={[
            { name: 'You', data: snapshot.pointsAccumulation.rider, color: '#38bdf8' },
            { name: 'Leader', data: snapshot.pointsAccumulation.leader, color: '#fbbf24' },
          ]}
        />
      </div>
    )
  }

  if (panelId === 'motoConsistency') {
    if (!hasRiderResults) return <NoResults />
    const { moto1, moto2, moto3 } = snapshot.motoAverages
    const motoBars = [
      { label: 'Moto 1', value: moto1, color: '#38bdf8' },
      { label: 'Moto 2', value: moto2, color: '#fbbf24' },
      { label: 'Moto 3', value: moto3, color: '#4ade80' },
    ].filter(
      (row): row is { label: string; value: number; color: string } =>
        row.value != null && row.value > 0,
    )
    if (motoBars.length === 0) return <NoResults />
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <SimpleBarChart
          categories={motoBars.map((row) => row.label)}
          values={motoBars.map((row) => row.value)}
          colors={motoBars.map((row) => row.color)}
          height={260}
          className="h-full w-full"
          showYAxis
        />
      </div>
    )
  }

  if (panelId === 'recentMomentum') {
    if (!hasRiderResults) return <NoResults />
    const m = snapshot.recentMomentum
    const placeValues = snapshot.placeOverTime.rider.filter((n) => Number.isFinite(n) && n > 0)
    const dataMin = placeValues.length ? Math.min(...placeValues) : 1
    const dataMax = placeValues.length ? Math.max(...placeValues) : 5
    const yMin = Math.max(1, dataMin * 0.9)
    const yMax = Math.max(yMin + 0.1, dataMax * 1.1)
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col gap-2">
        <div className="grid grid-cols-3 gap-2">
          <div className="border border-white/10 px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">
              Last {m.lastN || '—'}
            </p>
            <p
              className={`text-lg font-bold leading-tight ${
                m.placeChangePct == null
                  ? 'text-[#f5c518]'
                  : m.placeChangePct > 0
                    ? 'text-[#4ade80]'
                    : m.placeChangePct < 0
                      ? 'text-[#f87171]'
                      : 'text-[#f5c518]'
              }`}
            >
              {m.placeChangePct == null
                ? '—'
                : `${m.placeChangePct > 0 ? '↑' : m.placeChangePct < 0 ? '↓' : '→'} ${Math.abs(Math.round(m.placeChangePct))}%`}
            </p>
          </div>
          <div className="border border-white/10 px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">Avg place</p>
            <p className="text-lg font-bold leading-tight">{fmt(m.avgPlace)}</p>
          </div>
          <div className="border border-white/10 px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">Pts vs leader</p>
            <p className="text-lg font-bold leading-tight">
              {m.ptsVsLeader == null
                ? '—'
                : `${m.ptsVsLeader > 0 ? '+' : ''}${m.ptsVsLeader}`}
            </p>
          </div>
        </div>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-300">
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 bg-[#f5c518]" aria-hidden />
            Place
          </li>
          {m.avgPlace != null ? (
            <li className="flex items-center gap-1.5">
              <span
                className="inline-block h-0 w-4 border-t border-dashed border-[#4ade80]"
                aria-hidden
              />
              Recent avg
            </li>
          ) : null}
          <li className="text-zinc-500">Lower place is better</li>
        </ul>
        <div className="min-h-0 flex-1">
          <SimpleLineChart
            categories={snapshot.placeOverTime.labels}
            series={[
              { name: 'Place', data: snapshot.placeOverTime.rider, color: '#f5c518' },
            ]}
            height={160}
            className="h-full w-full"
            invertY
            yMin={yMin}
            yMax={yMax}
            hideReferenceLabel
            reference={
              m.avgPlace != null ? { value: m.avgPlace, label: 'Recent avg' } : undefined
            }
          />
        </div>
      </div>
    )
  }

  if (panelId === 'reliability') {
    if (!hasRiderResults) return <NoResults />
    const r = snapshot.reliability
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <span className="border border-white/15 px-2 py-1 text-sm">DNS {r.dns}</span>
          <span className="border border-white/15 px-2 py-1 text-sm">DNF {r.dnf}</span>
          <span className="border border-white/15 px-2 py-1 text-sm">DSQ {r.dsq}</span>
        </div>
        <p className="text-sm text-zinc-400">
          Finish rate:{' '}
          <span className="font-semibold text-white">
            {r.finishRate == null ? '—' : `${Math.round(r.finishRate * 100)}%`}
          </span>
        </p>
      </div>
    )
  }

  if (panelId === 'bikeMake') {
    if (!hasRiderResults) return <NoResults />
    const makes = snapshot.bikeMake.podiumByMake
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col gap-2">
        <p className="text-sm text-zinc-400">
          Your make:{' '}
          <span className="font-semibold text-white">{snapshot.bikeMake.riderMake ?? '—'}</span>
        </p>
        {makes.length ? (
          <div className="min-h-0 flex-1">
            <SimpleBarChart
              horizontal
              categories={makes.map((row) => row.make)}
              values={makes.map((row) => row.count)}
              color="#a1a1aa"
              height={220}
              className="h-full w-full"
            />
          </div>
        ) : (
          <NoResults />
        )}
      </div>
    )
  }

  if (panelId === 'headToHead') {
    if (!hasRiderResults) return <NoResults />
    const placeValues = [...h2h.rider, ...h2h.rival].filter(
      (n) => Number.isFinite(n) && n > 0,
    )
    const dataMax = placeValues.length ? Math.max(...placeValues) : 5
    const yMax = dataMax * 1.1
    return (
      <div className="space-y-3">
        <label className="block text-xs uppercase tracking-wide text-zinc-400">
          Rival
          <select
            className="control mt-1"
            value={rivalId ?? ''}
            onChange={(event) =>
              setRivalId(event.target.value ? Number(event.target.value) : null)
            }
          >
            {snapshot.headToHeadOptions.map((option) => (
              <option key={option.participantId} value={option.participantId}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
        {h2h.rivalName ? (
          <div className="space-y-2">
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-300">
              <li className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 bg-[#38bdf8]" aria-hidden />
                You
              </li>
              <li className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 bg-[#fbbf24]" aria-hidden />
                {h2h.rivalName}
              </li>
              <li className="text-zinc-500">Lower place is better</li>
            </ul>
            <SimpleLineChart
              categories={h2h.labels}
              series={[
                { name: 'You', data: h2h.rider, color: '#38bdf8' },
                { name: h2h.rivalName, data: h2h.rival, color: '#fbbf24' },
              ]}
              invertY
              yMin={1}
              yMax={yMax}
            />
          </div>
        ) : (
          <NoResults />
        )}
      </div>
    )
  }

  if (panelId === 'lastRaceBreakdown') {
    if (!hasRiderResults || !snapshot.lastRaceBreakdown) return <NoResults />
    const last = snapshot.lastRaceBreakdown
    const motoBars = [
      { label: 'Moto 1', value: last.race1, color: '#38bdf8' },
      { label: 'Moto 2', value: last.race2, color: '#fbbf24' },
      { label: 'Moto 3', value: last.race3, color: '#4ade80' },
    ].filter(
      (row): row is { label: string; value: number; color: string } =>
        row.value != null && row.value > 0,
    )
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col gap-2">
        <p className="truncate text-xs text-zinc-500">{last.eventName}</p>
        <div className="grid grid-cols-3 gap-2">
          <div className="border border-white/10 px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">Place</p>
            <p className="text-lg font-bold leading-tight text-[#f5c518]">{fmt(last.place, 0)}</p>
          </div>
          <div className="border border-white/10 px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">Points</p>
            <p className="text-lg font-bold leading-tight">{last.points}</p>
          </div>
          <div className="border border-white/10 px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">Field</p>
            <p className="text-lg font-bold leading-tight">{last.fieldSize}</p>
          </div>
        </div>
        {motoBars.length ? (
          <div className="min-h-0 flex-1">
            <SimpleBarChart
              categories={motoBars.map((row) => row.label)}
              values={motoBars.map((row) => row.value)}
              colors={motoBars.map((row) => row.color)}
              height={180}
              className="h-full w-full"
              showYAxis
            />
          </div>
        ) : (
          <p className="text-sm text-zinc-500">
            Class avg place: {fmt(last.classAvgPlace)}
          </p>
        )}
      </div>
    )
  }

  if (panelId === 'gapToNeighbors') {
    if (!snapshot.gapToNeighbors || snapshot.gapToNeighbors.window.length === 0) {
      return <NoResults />
    }
    const gap = snapshot.gapToNeighbors
    const ahead = [...gap.window].reverse().find((row) => row.gapFromYou > 0) ?? null
    const behind = gap.window.find((row) => row.gapFromYou < 0) ?? null
    const neighborColors = ['#38bdf8', '#fbbf24', '#a78bfa', '#f472b6', '#fb923c', '#22d3ee']
    let neighborColorIndex = 0
    const pointBars = gap.window.map((row) => ({
      label: row.isYou ? 'You' : row.name,
      value: row.points,
      color: row.isYou
        ? '#4ade80'
        : neighborColors[neighborColorIndex++ % neighborColors.length]!,
    }))
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col gap-2">
        <p className="text-xs text-zinc-500">
          Rank #{gap.youRank} · {gap.youPoints} pts
          {ahead ? ` · ${ahead.gapFromYou} behind ${ahead.name}` : ' · leading'}
          {behind ? ` · ${Math.abs(behind.gapFromYou)} ahead of ${behind.name}` : ''}
        </p>
        <div className="min-h-0 flex-1">
          <SimpleBarChart
            categories={pointBars.map((row) => row.label)}
            values={pointBars.map((row) => row.value)}
            colors={pointBars.map((row) => row.color)}
            height={220}
            className="h-full w-full"
            showYAxis
            verticalLabels
          />
        </div>
      </div>
    )
  }

  if (panelId === 'motoSpread') {
    if (!hasRiderResults || !snapshot.motoSpread) return <NoResults />
    const spread = snapshot.motoSpread
    const motoBars = [
      { label: 'Moto 1', value: spread.race1, color: '#38bdf8' },
      { label: 'Moto 2', value: spread.race2, color: '#fbbf24' },
      { label: 'Moto 3', value: spread.race3, color: '#4ade80' },
    ].filter(
      (row): row is { label: string; value: number; color: string } =>
        row.value != null && row.value > 0,
    )
    if (motoBars.length === 0) return <NoResults />
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs text-zinc-500">{spread.eventName}</p>
          <p className="shrink-0 text-sm font-semibold text-[#f5c518]">
            Spread {spread.spread == null ? '—' : spread.spread}
          </p>
        </div>
        <div className="min-h-0 flex-1">
          <SimpleBarChart
            categories={motoBars.map((row) => row.label)}
            values={motoBars.map((row) => row.value)}
            colors={motoBars.map((row) => row.color)}
            height={220}
            className="h-full w-full"
            showYAxis
          />
        </div>
      </div>
    )
  }

  if (panelId === 'pointsLeftOnTable') {
    if (!hasRiderResults || !snapshot.pointsLeftOnTable) return <NoResults />
    const left = snapshot.pointsLeftOnTable
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col gap-2">
        <p className="truncate text-xs text-zinc-500">{left.eventName}</p>
        <div className="grid grid-cols-3 gap-2">
          <div className="border border-white/10 px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">You</p>
            <p className="text-lg font-bold leading-tight text-[#38bdf8]">{left.yourPoints}</p>
          </div>
          <div className="border border-white/10 px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">Winner</p>
            <p className="text-lg font-bold leading-tight text-[#fbbf24]">{left.winnerPoints}</p>
          </div>
          <div className="border border-white/10 px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">Left</p>
            <p className="text-lg font-bold leading-tight text-[#f87171]">{left.left}</p>
          </div>
        </div>
        {left.winnerName ? (
          <p className="text-xs text-zinc-500">Winner: {left.winnerName}</p>
        ) : null}
        <div className="min-h-0 flex-1">
          <SimpleBarChart
            categories={['You', 'Winner']}
            values={[left.yourPoints, left.winnerPoints]}
            colors={['#38bdf8', '#fbbf24']}
            height={180}
            className="h-full w-full"
            showYAxis
          />
        </div>
      </div>
    )
  }

  if (panelId === 'roundCompare') {
    if (!hasRiderResults || !snapshot.roundCompare || snapshot.roundCompare.rounds.length < 2) {
      return <NoResults />
    }
    const rounds = snapshot.roundCompare.rounds
    const placeValues = rounds
      .map((round) => round.place)
      .filter((n): n is number => n != null && n > 0)
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col gap-2">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-300">
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 bg-[#38bdf8]" aria-hidden />
            Place
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 bg-[#fbbf24]" aria-hidden />
            Points
          </li>
        </ul>
        <div className="min-h-0 flex-1 space-y-2">
          <SimpleBarChart
            categories={rounds.map((round) => round.label)}
            values={rounds.map((round) => round.place ?? 0)}
            colors={['#38bdf8', '#818cf8']}
            height={120}
            className="h-auto w-full"
            showYAxis
          />
          <SimpleBarChart
            categories={rounds.map((round) => round.label)}
            values={rounds.map((round) => round.points)}
            colors={['#fbbf24', '#f59e0b']}
            height={120}
            className="h-auto w-full"
            showYAxis
          />
        </div>
        {placeValues.length === 0 ? (
          <p className="text-sm text-zinc-500">No place data for comparison.</p>
        ) : null}
      </div>
    )
  }

  return null
}
