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
    const places = snapshot.placeOverTime.rider.filter((n) => n > 0)
    const yMax = Math.max(5, ...places, ...snapshot.placeOverTime.classAvg)
    return (
      <div className="space-y-2">
        <p className="text-xs text-zinc-500">Lower place is better</p>
        <SimpleLineChart
          categories={snapshot.placeOverTime.labels}
          series={[
            { name: 'You', data: snapshot.placeOverTime.rider, color: '#38bdf8' },
            { name: 'Class avg', data: snapshot.placeOverTime.classAvg, color: '#71717a' },
          ]}
          invertY
          yMin={1}
          yMax={yMax}
          reference={
            snapshot.placeOverTime.seasonAvg != null
              ? { value: snapshot.placeOverTime.seasonAvg, label: 'Season avg' }
              : undefined
          }
        />
      </div>
    )
  }

  if (panelId === 'finishDistribution') {
    if (!hasRiderResults) return <NoResults />
    const { wins, podium, other } = snapshot.finishDistribution
    return (
      <SimplePieChart
        data={[
          { label: 'Wins (1st)', value: wins, color: '#f5c518' },
          { label: 'Podium (2–3)', value: podium, color: '#38bdf8' },
          { label: '4th+', value: other, color: '#52525b' },
        ]}
      />
    )
  }

  if (panelId === 'seriesStandings') {
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
        {standings.length === 0 ? (
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
                {standings.slice(0, 12).map((row, index) => (
                  <tr
                    key={row.participantId}
                    className={row.isYou ? 'bg-sky-500/15 text-sky-200' : 'text-zinc-200'}
                  >
                    <td className="py-1 pr-2">{index + 1}</td>
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
      <SimpleLineChart
        categories={snapshot.pointsAccumulation.labels}
        series={[
          { name: 'You', data: snapshot.pointsAccumulation.rider, color: '#38bdf8' },
          { name: 'Leader', data: snapshot.pointsAccumulation.leader, color: '#fbbf24' },
        ]}
      />
    )
  }

  if (panelId === 'motoConsistency') {
    if (!hasRiderResults) return <NoResults />
    const { moto1, moto2, moto3 } = snapshot.motoAverages
    if (moto1 == null && moto2 == null && moto3 == null) return <NoResults />
    return (
      <SimpleBarChart
        categories={['Moto 1', 'Moto 2', 'Moto 3']}
        values={[moto1 ?? 0, moto2 ?? 0, moto3 ?? 0]}
        color="#38bdf8"
      />
    )
  }

  if (panelId === 'recentMomentum') {
    if (!hasRiderResults) return <NoResults />
    const m = snapshot.recentMomentum
    return (
      <div className="grid grid-cols-3 gap-3">
        <div className="border border-white/10 p-3">
          <p className="text-xs uppercase text-zinc-500">Last {m.lastN || '—'}</p>
          <p className="text-2xl font-bold text-[#f5c518]">
            {m.improving == null ? '—' : m.improving ? '↑' : '↓'}
          </p>
        </div>
        <div className="border border-white/10 p-3">
          <p className="text-xs uppercase text-zinc-500">Avg place</p>
          <p className="text-2xl font-bold">{fmt(m.avgPlace)}</p>
        </div>
        <div className="border border-white/10 p-3">
          <p className="text-xs uppercase text-zinc-500">Pts vs leader</p>
          <p className="text-2xl font-bold">
            {m.ptsVsLeader == null
              ? '—'
              : `${m.ptsVsLeader > 0 ? '+' : ''}${m.ptsVsLeader}`}
          </p>
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
      <div className="space-y-2">
        <p className="text-sm text-zinc-400">
          Your make:{' '}
          <span className="font-semibold text-white">{snapshot.bikeMake.riderMake ?? '—'}</span>
        </p>
        {makes.length ? (
          <SimpleBarChart
            horizontal
            categories={makes.map((row) => row.make)}
            values={makes.map((row) => row.count)}
            color="#a1a1aa"
          />
        ) : (
          <NoResults />
        )}
      </div>
    )
  }

  if (panelId === 'headToHead') {
    if (!hasRiderResults) return <NoResults />
    const yMax = Math.max(5, ...h2h.rider, ...h2h.rival)
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
        ) : (
          <NoResults />
        )}
      </div>
    )
  }

  return null
}
