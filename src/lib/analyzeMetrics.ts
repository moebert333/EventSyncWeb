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

export type FinishDistributionSlice = {
  label: string
  value: number
  color: string
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
    /** Distinct events in the series that already have scored results. */
    eventsRun: number
    gapToLeader: number | null
  }
  placeOverTime: { labels: string[]; rider: number[]; classAvg: number[]; seasonAvg: number | null }
  finishDistribution: FinishDistributionSlice[]
  pointsAccumulation: { labels: string[]; rider: number[]; leader: number[] }
  motoAverages: { moto1: number | null; moto2: number | null; moto3: number | null }
  recentMomentum: {
    lastN: number
    avgPlace: number | null
    ptsVsLeader: number | null
    improving: boolean | null
    /** Percent place improvement vs earlier rounds (positive = better / lower place). */
    placeChangePct: number | null
  }
  reliability: { dns: number; dnf: number; dsq: number; finishRate: number | null }
  bikeMake: { riderMake: string | null; podiumByMake: { make: string; count: number }[] }
  headToHeadOptions: { participantId: number; name: string }[]
  lastRaceBreakdown: {
    eventName: string
    place: number | null
    points: number
    race1: number | null
    race2: number | null
    race3: number | null
    fieldSize: number
    classAvgPlace: number | null
  } | null
  gapToNeighbors: {
    youRank: number
    youPoints: number
    /** Up to 2 riders above, you, and up to 2 below (scored standings order). */
    window: {
      rank: number
      name: string
      points: number
      /** Points vs you: positive = ahead, negative = behind, 0 = you. */
      gapFromYou: number
      isYou: boolean
    }[]
  } | null
  motoSpread: {
    eventName: string
    race1: number | null
    race2: number | null
    race3: number | null
    spread: number | null
  } | null
  pointsLeftOnTable: {
    eventName: string
    yourPoints: number
    winnerPoints: number
    left: number
    winnerName: string | null
  } | null
  roundCompare: {
    rounds: {
      label: string
      place: number | null
      points: number
      race1: number | null
      race2: number | null
      race3: number | null
    }[]
  } | null
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

function ordinalPlace(place: number): string {
  const mod100 = place % 100
  const mod10 = place % 10
  if (mod100 >= 11 && mod100 <= 13) return `${place}th`
  if (mod10 === 1) return `${place}st`
  if (mod10 === 2) return `${place}nd`
  if (mod10 === 3) return `${place}rd`
  return `${place}th`
}

/** Distinct palette so adjacent mid/back-pack finishes stay visible on the pie. */
const FINISH_SLICE_COLORS = [
  '#38bdf8',
  '#818cf8',
  '#34d399',
  '#fb7185',
  '#f59e0b',
  '#64748b',
  '#a78bfa',
  '#52525b',
]

function colorForSlice(index: number, place: number): string {
  if (place === 1) return '#f5c518'
  return FINISH_SLICE_COLORS[index % FINISH_SLICE_COLORS.length]!
}

/** Prefer classic wins/podium/4th+ buckets; expand by place when that would under-slice. */
export function buildFinishDistribution(riderResults: RiderEventResult[]): FinishDistributionSlice[] {
  const total = riderResults.length
  if (total === 0) return []

  const minWanted = total >= 3 ? 3 : total >= 2 ? 2 : 1
  const placeCounts = new Map<number, number>()
  let noPlace = 0
  for (const result of riderResults) {
    if (result.overallPlace == null) {
      noPlace += 1
      continue
    }
    placeCounts.set(result.overallPlace, (placeCounts.get(result.overallPlace) ?? 0) + 1)
  }

  const wins = placeCounts.get(1) ?? 0
  const podium = (placeCounts.get(2) ?? 0) + (placeCounts.get(3) ?? 0)
  const other =
    [...placeCounts.entries()]
      .filter(([place]) => place >= 4)
      .reduce((sum, [, count]) => sum + count, 0) + noPlace
  const classic: FinishDistributionSlice[] = [
    { label: 'Wins (1st)', value: wins, color: '#f5c518' },
    { label: 'Podium (2–3)', value: podium, color: '#38bdf8' },
    { label: '4th+', value: other, color: '#52525b' },
  ]
  const classicActive = classic.filter((slice) => slice.value > 0).length
  if (classicActive >= minWanted) return classic

  type PlaceGroup = { min: number; max: number; count: number }
  const groups: PlaceGroup[] = [...placeCounts.keys()]
    .sort((a, b) => a - b)
    .map((place) => ({ min: place, max: place, count: placeCounts.get(place)! }))

  const maxSlices = 3
  while (groups.length + (noPlace > 0 ? 1 : 0) > maxSlices && groups.length > 1) {
    let bestIndex = 0
    let bestGap = Infinity
    for (let i = 0; i < groups.length - 1; i++) {
      const gap = groups[i + 1]!.min - groups[i]!.max
      if (gap < bestGap) {
        bestGap = gap
        bestIndex = i
      }
    }
    const left = groups[bestIndex]!
    const right = groups[bestIndex + 1]!
    groups.splice(bestIndex, 2, {
      min: left.min,
      max: right.max,
      count: left.count + right.count,
    })
  }

  // If still over the cap because of a trailing "No place" bucket, fold it into the last range.
  if (noPlace > 0 && groups.length >= maxSlices) {
    const last = groups[groups.length - 1]!
    last.count += noPlace
    noPlace = 0
  }

  const slices: FinishDistributionSlice[] = groups.map((group, index) => ({
    label:
      group.min === group.max
        ? ordinalPlace(group.min)
        : `${ordinalPlace(group.min)}–${ordinalPlace(group.max)}`,
    value: group.count,
    color: colorForSlice(index, group.min),
  }))
  if (noPlace > 0 && slices.length < maxSlices) {
    slices.push({
      label: 'No place',
      value: noPlace,
      color: colorForSlice(slices.length, 99),
    })
  }
  return slices.slice(0, maxSlices)
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

  const finishDistribution = buildFinishDistribution(riderResults)

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

  const eventsRun = new Set(rows.map((row) => row.event_id)).size
  const lastResult = riderResults.length ? riderResults[riderResults.length - 1]! : null

  let lastRaceBreakdown: AnalyzeSnapshot['lastRaceBreakdown'] = null
  let motoSpread: AnalyzeSnapshot['motoSpread'] = null
  let pointsLeftOnTable: AnalyzeSnapshot['pointsLeftOnTable'] = null
  if (lastResult) {
    const fieldRows = rows.filter(
      (row) =>
        row.event_id === lastResult.eventId && row.class_name === lastResult.className,
    )
    const fieldPlaces = fieldRows
      .map((row) => numericPlace(row.overall_place))
      .filter((n): n is number => n != null)
    lastRaceBreakdown = {
      eventName: lastResult.eventName,
      place: lastResult.overallPlace,
      points: lastResult.overallPoints,
      race1: lastResult.race1,
      race2: lastResult.race2,
      race3: lastResult.race3,
      fieldSize: fieldRows.length,
      classAvgPlace: avg(fieldPlaces),
    }
    const motoValues = [lastResult.race1, lastResult.race2, lastResult.race3].filter(
      (n): n is number => n != null,
    )
    motoSpread = {
      eventName: lastResult.eventName,
      race1: lastResult.race1,
      race2: lastResult.race2,
      race3: lastResult.race3,
      spread: motoValues.length >= 2 ? Math.max(...motoValues) - Math.min(...motoValues) : null,
    }
    const winnerRow = [...fieldRows]
      .map((row) => ({
        name: riderName(row.first_name, row.last_name),
        points: row.overall_points ?? 0,
        place: numericPlace(row.overall_place) ?? 999,
      }))
      .sort((a, b) => b.points - a.points || a.place - b.place)[0]
    const winnerPoints = winnerRow?.points ?? lastResult.overallPoints
    pointsLeftOnTable = {
      eventName: lastResult.eventName,
      yourPoints: lastResult.overallPoints,
      winnerPoints,
      left: Math.max(0, winnerPoints - lastResult.overallPoints),
      winnerName: winnerRow?.name ?? null,
    }
  }

  let gapToNeighbors: AnalyzeSnapshot['gapToNeighbors'] = null
  const scoredFocusStandings = focusStandings.filter((row) => row.points > 0)
  const youInScored = scoredFocusStandings.find((row) => row.isYou) ?? null
  if (youInScored) {
    const youIdx = scoredFocusStandings.indexOf(youInScored)
    const youRank = youIdx + 1
    const start = Math.max(0, youIdx - 2)
    const end = Math.min(scoredFocusStandings.length, youIdx + 3)
    gapToNeighbors = {
      youRank,
      youPoints: youInScored.points,
      window: scoredFocusStandings.slice(start, end).map((row, offset) => {
        const rank = start + offset + 1
        return {
          rank,
          name: row.name,
          points: row.points,
          gapFromYou: row.points - youInScored.points,
          isYou: row.isYou,
        }
      }),
    }
  }

  const compareSource = riderResults.slice(0, 2)
  const roundCompare: AnalyzeSnapshot['roundCompare'] =
    compareSource.length >= 1
      ? {
          rounds: compareSource.map((result, index) => ({
            label: labels[index] ?? `Rd ${index + 1}`,
            place: result.overallPlace,
            points: result.overallPoints,
            race1: result.race1,
            race2: result.race2,
            race3: result.race3,
          })),
        }
      : null

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
      eventsRun,
      gapToLeader:
        youStanding && leader ? leader.points - youStanding.points : null,
    },
    placeOverTime: {
      labels,
      rider: riderResults.map((result) => result.overallPlace ?? 0),
      classAvg: classAvgPlaces,
      seasonAvg,
    },
    finishDistribution,
    pointsAccumulation: { labels, rider: riderCumSeries, leader: leaderCumSeries },
    motoAverages: { moto1, moto2, moto3 },
    recentMomentum: {
      lastN,
      avgPlace: recentAvg,
      ptsVsLeader: lastN > 0 ? recentRiderPts - recentLeaderPts : null,
      improving:
        earlyAvg != null && recentAvg != null ? recentAvg < earlyAvg : null,
      placeChangePct:
        earlyAvg != null && recentAvg != null && earlyAvg > 0
          ? ((earlyAvg - recentAvg) / earlyAvg) * 100
          : null,
    },
    reliability: { dns, dnf, dsq, finishRate },
    bikeMake: {
      riderMake: riderResults.map((result) => result.make).find(Boolean) ?? null,
      podiumByMake: [...podiumByMake.entries()]
        .map(([make, count]) => ({ make, count }))
        .sort((a, b) => b.count - a.count),
    },
    headToHeadOptions,
    lastRaceBreakdown,
    gapToNeighbors,
    motoSpread,
    pointsLeftOnTable,
    roundCompare,
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

/**
 * Compact JSON for Analyze AI — full series places/points + focus rider detail.
 * `seriesResults` rows: `[eventIdx, classIdx, riderIdx, place|null, points]`.
 * Motos live on focusRider.results only (keeps series payload smaller).
 * `focusRider.standings` is the full focus-class table (needed for “closest to” Qs).
 */
export function snapshotForAi(
  snapshot: AnalyzeSnapshot,
  seriesName: string,
  riderLabel: string,
  events: SeriesEventRef[] = [],
  rows: EventClassResult[] = [],
) {
  const focusClass = snapshot.riderClassName
  const eventList = events.length
    ? events
    : snapshot.riderResults.map((result) => ({
        event_id: result.eventId,
        name: result.eventName,
        date: result.eventDate,
      }))

  const eventIndex = new Map<number, number>()
  const eventCatalog = eventList.map((event, index) => {
    eventIndex.set(event.event_id, index)
    return { n: event.name, d: event.date }
  })

  const classNames = [
    ...new Set(
      (rows.length ? rows.map((row) => row.class_name) : snapshot.classNames).filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b))
  const classIndex = new Map(classNames.map((name, index) => [name, index]))

  const riderById = new Map<number, { i: number; n: string; p: string | null }>()
  const sourceRows =
    rows.length > 0
      ? rows
      : snapshot.riderResults.map(
          (result) =>
            ({
              event_id: result.eventId,
              event_name: result.eventName,
              class_id: result.classId,
              class_name: result.className,
              overall_place: result.overallPlace,
              participant_id: -1,
              first_name: riderLabel,
              last_name: '',
              participant_plate: null,
              make: result.make,
              overall_points: result.overallPoints,
              race1_place: result.race1,
              race2_place: result.race2,
              race3_place: result.race3,
              semi1_place: null,
              semi2_place: null,
              lcq_place: null,
              finals_place: null,
            }) satisfies EventClassResult,
        )

  for (const row of sourceRows) {
    if (riderById.has(row.participant_id)) continue
    riderById.set(row.participant_id, {
      i: riderById.size,
      n: riderName(row.first_name, row.last_name),
      p: row.participant_plate,
    })
  }
  const riderCatalog = [...riderById.values()].map(({ n, p }) => (p ? [n, p] : [n]))

  const seriesResults: (number | null)[][] = []
  for (const row of sourceRows) {
    const eIdx = eventIndex.get(row.event_id)
    const cIdx = classIndex.get(row.class_name)
    const rIdx = riderById.get(row.participant_id)?.i
    if (eIdx == null || cIdx == null || rIdx == null) continue
    seriesResults.push([
      eIdx,
      cIdx,
      rIdx,
      numericPlace(row.overall_place),
      row.overall_points ?? 0,
    ])
  }

  return {
    seriesName,
    focusClass,
    schema: {
      riders: '[name] or [name, plate]',
      seriesResults: '[eventIdx, classIdx, riderIdx, place, points]',
      standings: 'focusClass series table [{r,n,pts,ev,avg,you?}] — use for closest/gap questions',
      note: 'Default scope is focusRider + focusClass unless another class/series-wide ask is clear. Motos are on focusRider.results only. For standings proximity, use focusRider.standings (full class), not a top-N guess.',
    },
    events: eventCatalog,
    classes: classNames,
    riders: riderCatalog,
    seriesResults,
    focusRider: {
      name: riderLabel,
      class: focusClass,
      summary: snapshot.summary,
      results: snapshot.riderResults.map((result) => ({
        e: result.eventName,
        pl: result.overallPlace,
        pts: result.overallPoints,
        m: [result.race1, result.race2, result.race3],
        st: result.statusLabel,
      })),
      standings: (focusClass ? snapshot.standingsByClass[focusClass] ?? [] : []).map(
        (row, index) => ({
          r: index + 1,
          n: row.name,
          pts: row.points,
          ev: row.events,
          avg: row.avgPlace,
          you: row.isYou || undefined,
        }),
      ),
      motoAvg: snapshot.motoAverages,
      lastRace: snapshot.lastRaceBreakdown,
      gapToNeighbors: snapshot.gapToNeighbors,
      motoSpread: snapshot.motoSpread,
      pointsLeft: snapshot.pointsLeftOnTable,
      roundCompare: snapshot.roundCompare,
    },
  }
}
