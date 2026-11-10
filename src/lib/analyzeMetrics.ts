import { placeRank, riderName } from './format'
import type { EventClassResult, EventRow } from '../types/database'

export type SeriesEventRef = Pick<EventRow, 'event_id' | 'name' | 'date'>

export type RiderEventResult = {
  eventId: number
  eventName: string
  eventDate: string | null
  classId: number
  className: string
  overallPlace: number | null
  overallPoints: number
  race1: number | null
  race2: number | null
  race3: number | null
  make: string | null
  statusLabel: string | null
}

export type StandingRow = {
  participantId: number
  name: string
  plate: string | null
  events: number
  points: number
  bestPlace: number | null
  avgPlace: number | null
  isYou: boolean
}

export type AnalyzeSnapshot = {
  /** Focus class used for summary + most panels (selected in Dashboard header). */
  riderClassName: string | null
  /** Classes this rider raced in within the series (header Class picker). */
  riderClassNames: string[]
  /** All classes in the series (Standings panel picker). */
  classNames: string[]
  riderResults: RiderEventResult[]
  standingsByClass: Record<string, StandingRow[]>
  summary: {
    seriesRank: number | null
    seriesPoints: number
    eventsRaced: number
    eventsInSeries: number
    gapToLeader: number | null
  }
  placeOverTime: { labels: string[]; rider: number[]; classAvg: number[]; seasonAvg: number | null }
  finishDistribution: { wins: number; podium: number; other: number }
  pointsAccumulation: { labels: string[]; rider: number[]; leader: number[] }
  motoAverages: { moto1: number | null; moto2: number | null; moto3: number | null }
  recentMomentum: {
    lastN: number
    avgPlace: number | null
    ptsVsLeader: number | null
    improving: boolean | null
  }
  reliability: { dns: number; dnf: number; dsq: number; finishRate: number | null }
  bikeMake: { riderMake: string | null; podiumByMake: { make: string; count: number }[] }
  headToHeadOptions: { participantId: number; name: string }[]
}

function numericPlace(value: string | number | null | undefined): number | null {
  const rank = placeRank(value)
  if (rank >= 8_000) return null
  return rank
}

function statusFromPlace(value: string | number | null | undefined): string | null {
  if (value == null || value === '') return null
  const upper = String(value).trim().toUpperCase()
  if (upper === 'DNS' || upper === 'DNF' || upper === 'DSQ' || upper === 'DNS/DNF') return upper
  return null
}

function shortEventLabel(event: SeriesEventRef, index: number): string {
  if (event.date) {
    const [, month, day] = event.date.slice(0, 10).split('-')
    if (month && day) return `${Number(month)}/${Number(day)}`
  }
  return `Rd ${index + 1}`
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((sum, n) => sum + n, 0) / nums.length
}

/** Classes the rider appears in for this series, sorted. */
export function riderClassNamesFor(
  rows: EventClassResult[],
  participantId: number | null,
): string[] {
  if (participantId == null) return []
  return [
    ...new Set(
      rows.filter((row) => row.participant_id === participantId).map((row) => row.class_name),
    ),
  ].sort((a, b) => a.localeCompare(b))
}

export function buildAnalyzeSnapshot(
  events: SeriesEventRef[],
  rows: EventClassResult[],
  participantId: number | null,
  focusClassName: string | null = null,
): AnalyzeSnapshot {
  const orderedEvents = [...events].sort((a, b) => {
    const da = a.date ?? ''
    const db = b.date ?? ''
    if (da !== db) return da.localeCompare(db)
    return a.event_id - b.event_id
  })
  const eventById = new Map(orderedEvents.map((event) => [event.event_id, event]))
  const classNames = [...new Set(rows.map((row) => row.class_name))].sort((a, b) =>
    a.localeCompare(b),
  )
  const riderClassNames = riderClassNamesFor(rows, participantId)
  const riderClassName =
    focusClassName && riderClassNames.includes(focusClassName)
      ? focusClassName
      : (riderClassNames[0] ?? null)

  const riderResults: RiderEventResult[] = []
  if (participantId != null && riderClassName != null) {
    for (const event of orderedEvents) {
      const preferred = rows.find(
        (row) =>
          row.event_id === event.event_id &&
          row.participant_id === participantId &&
          row.class_name === riderClassName,
      )
      if (!preferred) continue
      const status = statusFromPlace(preferred.overall_place)
      riderResults.push({
        eventId: event.event_id,
        eventName: event.name,
        eventDate: event.date,
        classId: preferred.class_id,
        className: preferred.class_name,
        overallPlace: numericPlace(preferred.overall_place),
        overallPoints: preferred.overall_points ?? 0,
        race1: numericPlace(preferred.race1_place),
        race2: numericPlace(preferred.race2_place),
        race3: numericPlace(preferred.race3_place),
        make: preferred.make,
        statusLabel: status,
      })
    }
  }

  const standingsByClass: Record<string, StandingRow[]> = {}
  for (const className of classNames) {
    const byRider = new Map<
      number,
      {
        name: string
        plate: string | null
        points: number
        places: number[]
        events: Set<number>
      }
    >()
    for (const row of rows) {
      if (row.class_name !== className) continue
      if (!eventById.has(row.event_id)) continue
      const current = byRider.get(row.participant_id) ?? {
        name: riderName(row.first_name, row.last_name),
        plate: row.participant_plate,
        points: 0,
        places: [],
        events: new Set<number>(),
      }
      current.points += row.overall_points ?? 0
      current.events.add(row.event_id)
      const place = numericPlace(row.overall_place)
      if (place != null) current.places.push(place)
      byRider.set(row.participant_id, current)
    }
    const standings: StandingRow[] = [...byRider.entries()]
      .map(([id, value]) => ({
        participantId: id,
        name: value.name,
        plate: value.plate,
        events: value.events.size,
        points: value.points,
        bestPlace: value.places.length ? Math.min(...value.places) : null,
        avgPlace: avg(value.places),
        isYou: participantId != null && id === participantId,
      }))
      .sort(
        (a, b) =>
          b.points - a.points ||
          (a.avgPlace ?? 999) - (b.avgPlace ?? 999) ||
          a.name.localeCompare(b.name),
      )
    standingsByClass[className] = standings
  }

  const focusClass = riderClassName ?? classNames[0] ?? null
  const focusStandings = focusClass ? (standingsByClass[focusClass] ?? []) : []
  const youStanding = focusStandings.find((row) => row.isYou) ?? null
  const leader = focusStandings[0] ?? null

  const labels = riderResults.map((result, index) => {
    const event = eventById.get(result.eventId)
    return event ? shortEventLabel(event, orderedEvents.indexOf(event)) : `Rd ${index + 1}`
  })

  const classAvgPlaces: number[] = []
  for (const result of riderResults) {
    const eventPlaces = rows
      .filter(
        (row) =>
          row.event_id === result.eventId &&
          row.class_name === result.className &&
          numericPlace(row.overall_place) != null,
      )
      .map((row) => numericPlace(row.overall_place)!)
    classAvgPlaces.push(avg(eventPlaces) ?? result.overallPlace ?? 0)
  }

  const riderPlaces = riderResults.map((result) => result.overallPlace).filter((n): n is number => n != null)
  const seasonAvg = avg(riderPlaces)

  let riderCum = 0
  let leaderCum = 0
  const riderCumSeries: number[] = []
  const leaderCumSeries: number[] = []
  for (const result of riderResults) {
    riderCum += result.overallPoints
    const leaderRow = rows
      .filter((row) => row.event_id === result.eventId && row.class_name === result.className)
      .map((row) => ({
        id: row.participant_id,
        points: row.overall_points ?? 0,
        place: numericPlace(row.overall_place) ?? 999,
      }))
      .sort((a, b) => b.points - a.points || a.place - b.place)[0]
    leaderCum += leaderRow?.points ?? 0
    riderCumSeries.push(riderCum)
    leaderCumSeries.push(leaderCum)
  }

  const wins = riderResults.filter((result) => result.overallPlace === 1).length
  const podium = riderResults.filter(
    (result) => result.overallPlace != null && result.overallPlace >= 2 && result.overallPlace <= 3,
  ).length
  const other = riderResults.length - wins - podium

  const moto1 = avg(riderResults.map((result) => result.race1).filter((n): n is number => n != null))
  const moto2 = avg(riderResults.map((result) => result.race2).filter((n): n is number => n != null))
  const moto3 = avg(riderResults.map((result) => result.race3).filter((n): n is number => n != null))

  const lastN = Math.min(3, riderResults.length)
  const recent = riderResults.slice(-lastN)
  const recentPlaces = recent
    .map((result) => result.overallPlace)
    .filter((n): n is number => n != null)
  const early = riderResults.slice(0, Math.max(0, riderResults.length - lastN))
  const earlyAvg = avg(
    early.map((result) => result.overallPlace).filter((n): n is number => n != null),
  )
  const recentAvg = avg(recentPlaces)
  const recentRiderPts = recent.reduce((sum, result) => sum + result.overallPoints, 0)
  let recentLeaderPts = 0
  if (leader && focusClass) {
    for (const result of recent) {
      const leaderEvent = rows.find(
        (row) =>
          row.event_id === result.eventId &&
          row.class_name === focusClass &&
          row.participant_id === leader.participantId,
      )
      recentLeaderPts += leaderEvent?.overall_points ?? 0
    }
  }

  let dns = 0
  let dnf = 0
  let dsq = 0
  for (const result of riderResults) {
    const label = result.statusLabel
    if (!label) continue
    if (label === 'DNS' || label === 'DNS/DNF') dns += 1
    else if (label === 'DNF') dnf += 1
    else if (label === 'DSQ') dsq += 1
  }
  const scored = riderResults.filter((result) => result.overallPlace != null).length
  const finishRate = riderResults.length ? scored / riderResults.length : null

  const podiumByMake = new Map<string, number>()
  if (focusClass) {
    for (const row of rows) {
      if (row.class_name !== focusClass) continue
      const place = numericPlace(row.overall_place)
      if (place == null || place > 3) continue
      const make = (row.make ?? 'Other').trim() || 'Other'
      podiumByMake.set(make, (podiumByMake.get(make) ?? 0) + 1)
    }
  }

  const headToHeadOptions = focusStandings
    .filter((row) => !row.isYou)
    .slice(0, 12)
    .map((row) => ({ participantId: row.participantId, name: row.name }))

  return {
    riderClassName,
    riderClassNames,
    classNames,
    riderResults,
    standingsByClass,
    summary: {
      seriesRank: youStanding ? focusStandings.indexOf(youStanding) + 1 : null,
      seriesPoints: youStanding?.points ?? 0,
      eventsRaced: youStanding?.events ?? riderResults.length,
      eventsInSeries: orderedEvents.length,
      gapToLeader:
        youStanding && leader ? leader.points - youStanding.points : null,
    },
    placeOverTime: {
      labels,
      rider: riderResults.map((result) => result.overallPlace ?? 0),
      classAvg: classAvgPlaces,
      seasonAvg,
    },
    finishDistribution: { wins, podium, other },
    pointsAccumulation: { labels, rider: riderCumSeries, leader: leaderCumSeries },
    motoAverages: { moto1, moto2, moto3 },
    recentMomentum: {
      lastN,
      avgPlace: recentAvg,
      ptsVsLeader: lastN > 0 ? recentRiderPts - recentLeaderPts : null,
      improving:
        earlyAvg != null && recentAvg != null ? recentAvg < earlyAvg : null,
    },
    reliability: { dns, dnf, dsq, finishRate },
    bikeMake: {
      riderMake: riderResults.map((result) => result.make).find(Boolean) ?? null,
      podiumByMake: [...podiumByMake.entries()]
        .map(([make, count]) => ({ make, count }))
        .sort((a, b) => b.count - a.count),
    },
    headToHeadOptions,
  }
}

export function headToHeadPlaces(
  snapshot: AnalyzeSnapshot,
  rows: EventClassResult[],
  rivalId: number | null,
): { labels: string[]; rider: number[]; rival: number[]; rivalName: string | null } {
  const rivalName =
    snapshot.headToHeadOptions.find((option) => option.participantId === rivalId)?.name ?? null
  const labels = snapshot.placeOverTime.labels
  const rider = snapshot.placeOverTime.rider
  const rival: number[] = []
  for (const result of snapshot.riderResults) {
    const rivalRow = rows.find(
      (row) =>
        row.event_id === result.eventId &&
        row.class_name === result.className &&
        row.participant_id === rivalId,
    )
    rival.push(numericPlace(rivalRow?.overall_place ?? null) ?? 0)
  }
  return { labels, rider, rival, rivalName }
}

/** Compact JSON for Groq — keep tokens low. */
export function snapshotForAi(snapshot: AnalyzeSnapshot, seriesName: string, riderLabel: string) {
  return {
    seriesName,
    rider: riderLabel,
    class: snapshot.riderClassName,
    summary: snapshot.summary,
    results: snapshot.riderResults.map((result) => ({
      event: result.eventName,
      date: result.eventDate,
      place: result.overallPlace,
      points: result.overallPoints,
      moto: [result.race1, result.race2, result.race3],
      status: result.statusLabel,
    })),
    standingsTop: (snapshot.riderClassName
      ? snapshot.standingsByClass[snapshot.riderClassName] ?? []
      : []
    )
      .slice(0, 8)
      .map((row, index) => ({
        rank: index + 1,
        name: row.name,
        points: row.points,
        events: row.events,
        avgPlace: row.avgPlace,
        isYou: row.isYou,
      })),
    motoAverages: snapshot.motoAverages,
    recentMomentum: snapshot.recentMomentum,
    finishDistribution: snapshot.finishDistribution,
  }
}
