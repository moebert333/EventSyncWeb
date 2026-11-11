import type { ActiveRaceTiming, EventRaceOrderRow, RaceInProgress, RaceStatus } from '../types/database'
import type { StoredEventContext } from './eventContext'
import { secondsToRaceTime } from './format'
import { supabase } from './supabase'

export type SimParticipantSeed = {
  class_id: number
  class_name: string
  participant_id: number
  participant_plate: string | null
  first_name: string
  last_name: string
}

type RiderState = SimParticipantSeed & {
  skill: number
  lastCrossingAt: number
  nextLapAt: number
  /** Planned duration of the lap currently in progress. */
  pendingLapTime: number
  /** Duration of the most recently completed lap. */
  lastLapTime: number
  currentLapNum: number
  bestLapSec: number | null
  bestLapNum: number | null
  raceElapsedSec: number
  /** Race elapsed time when each lap number was completed. */
  elapsedAtLap: Map<number, number>
}

export type RaceSimulationSnapshot = {
  race: RaceInProgress
  timingRows: ActiveRaceTiming[]
}

export type RaceSimulation = {
  tick: (nowMs: number) => RaceSimulationSnapshot
  getSnapshot: () => RaceSimulationSnapshot
  pause: (nowMs: number) => RaceSimulationSnapshot
  resume: (nowMs: number) => RaceSimulationSnapshot
  isPaused: () => boolean
  getStatus: () => RaceStatus
  /** Staging → Active; starts the lap clock. */
  beginActive: (nowMs: number) => RaceSimulationSnapshot
  /** Freeze as Finished. */
  finish: (nowMs: number) => RaceSimulationSnapshot
  /** True when every rider has reached maxLaps (if configured). */
  allLapsComplete: () => boolean
}

type ParticipantViewRow = {
  class_id: number
  class_name: string
  participant_id: number
  participant_plate: string | null
  first_name: string
  last_name: string
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function jitterFactor(): number {
  return 0.94 + Math.random() * 0.12
}

function planLapSeconds(baseLapSec: number, skill: number): number {
  return Math.max(1, baseLapSec * skill * jitterFactor())
}

function placeLabel(place: number): string {
  if (place > 80) return 'DNS/DNF'
  return String(place)
}

async function loadParticipantsFallback(raceId: number, eventId: number): Promise<SimParticipantSeed[]> {
  const raceClasses = await supabase
    .from('race_class')
    .select('class_id, classes!inner(class_id, class_name, event_id)')
    .eq('race_id', raceId)
  if (raceClasses.error) throw raceClasses.error

  type ClassJoin = {
    class_id: number
    classes:
      | { class_id: number; class_name: string; event_id: number }
      | { class_id: number; class_name: string; event_id: number }[]
      | null
  }

  const classRows: { class_id: number; class_name: string }[] = []
  for (const row of (raceClasses.data ?? []) as ClassJoin[]) {
    const related = Array.isArray(row.classes) ? row.classes[0] : row.classes
    if (!related || related.event_id !== eventId) continue
    classRows.push({ class_id: related.class_id, class_name: related.class_name })
  }
  if (classRows.length === 0) return []

  const classIds = classRows.map((row) => row.class_id)
  const entries = await supabase
    .from('event_entry')
    .select('class_id, participant_id, participant_plate, participants(first_name, last_name)')
    .eq('event_id', eventId)
    .in('class_id', classIds)
  if (entries.error) throw entries.error

  type EntryRow = {
    class_id: number
    participant_id: number
    participant_plate: string | null
    participants:
      | { first_name: string; last_name: string }
      | { first_name: string; last_name: string }[]
      | null
  }

  const classNameById = new Map(classRows.map((row) => [row.class_id, row.class_name]))
  const seeds: SimParticipantSeed[] = []
  const seen = new Set<string>()
  for (const row of (entries.data ?? []) as EntryRow[]) {
    const key = `${row.class_id}:${row.participant_id}`
    if (seen.has(key)) continue
    const name = Array.isArray(row.participants) ? row.participants[0] : row.participants
    if (!name) continue
    seen.add(key)
    seeds.push({
      class_id: row.class_id,
      class_name: classNameById.get(row.class_id) ?? `Class ${row.class_id}`,
      participant_id: row.participant_id,
      participant_plate: row.participant_plate,
      first_name: name.first_name,
      last_name: name.last_name,
    })
  }
  return seeds
}

/** Load entrants for a race (read-only). Prefer `active_race_participants`. */
export async function loadRaceSimulationParticipants(
  raceId: number,
  eventId: number,
): Promise<SimParticipantSeed[]> {
  const view = await supabase
    .from('active_race_participants')
    .select(
      'class_id, class_name, participant_id, participant_plate, first_name, last_name, event_id, race_id',
    )
    .eq('race_id', raceId)
    .eq('event_id', eventId)
  if (view.error) throw view.error

  const seeds: SimParticipantSeed[] = []
  const seen = new Set<string>()
  for (const row of (view.data ?? []) as ParticipantViewRow[]) {
    const key = `${row.class_id}:${row.participant_id}`
    if (seen.has(key)) continue
    seen.add(key)
    seeds.push({
      class_id: row.class_id,
      class_name: row.class_name,
      participant_id: row.participant_id,
      participant_plate: row.participant_plate,
      first_name: row.first_name,
      last_name: row.last_name,
    })
  }
  if (seeds.length > 0) return seeds
  return loadParticipantsFallback(raceId, eventId)
}

function buildRaceHeader(
  context: StoredEventContext,
  race: EventRaceOrderRow,
  elapsedRaceTime: string,
  status: RaceStatus,
): RaceInProgress {
  return {
    race_num: race.race_num,
    race_id: race.race_id,
    event_id: context.eventId,
    series_id: context.seriesId,
    event_name: context.eventName,
    session_name: race.session_name ?? '',
    race_name: race.race_name,
    is_practice: race.is_practice,
    race_date: context.eventDate,
    race_start: null,
    description: null,
    elapsed_race_time: elapsedRaceTime,
    status,
  }
}

/**
 * Gap when `behind` completed their current lap vs when `ahead` completed that same lap.
 * Falls back to overall elapsed difference if ahead has not recorded that lap yet.
 */
function gapAtBehindLap(behind: RiderState, ahead: RiderState): number {
  const lap = behind.currentLapNum
  const behindT = behind.elapsedAtLap.get(lap)
  const aheadT = ahead.elapsedAtLap.get(lap)
  if (behindT == null) return 0
  if (aheadT != null) return Math.max(0, behindT - aheadT)
  return Math.max(0, behind.raceElapsedSec - ahead.raceElapsedSec)
}

type SimRaceMeta = {
  event_id: number
  event_name: string
  race_id: number
  race_num: number
  is_practice: boolean
  race_name: string | null
  session_name: string
}

const ZERO_TIME = '00:00:00'

/** Pre-start / pre-first-lap row: riders visible with empty timing. */
function emptyTimingRow(seed: SimParticipantSeed, meta: SimRaceMeta): ActiveRaceTiming {
  return {
    event_id: meta.event_id,
    event_name: meta.event_name,
    race_id: meta.race_id,
    race_num: meta.race_num,
    is_practice: meta.is_practice,
    race_name: meta.race_name,
    session_name: meta.session_name,
    class_id: seed.class_id,
    class_name: seed.class_name,
    place_num: '0',
    current_lap_num: 0,
    status: 'valid',
    participant_id: seed.participant_id,
    participant_plate: seed.participant_plate,
    first_name: seed.first_name,
    last_name: seed.last_name,
    current_lap_time: ZERO_TIME,
    best_lap_num: 0,
    best_lap_time: ZERO_TIME,
    race_elapsed_time: ZERO_TIME,
    leader_gap_time: ZERO_TIME,
    next_gap_time: ZERO_TIME,
  }
}

/** Build one frozen timing row for a rider at the moment they complete a lap. */
function timingRowForCrossing(
  rider: RiderState,
  riders: RiderState[],
  meta: SimRaceMeta,
): ActiveRaceTiming {
  const classRiders = riders
    .filter((row) => row.class_id === rider.class_id && row.currentLapNum >= 1)
    .sort((a, b) => {
      if (b.currentLapNum !== a.currentLapNum) return b.currentLapNum - a.currentLapNum
      return a.raceElapsedSec - b.raceElapsedSec
    })
  const placeIndex = classRiders.findIndex(
    (row) => row.participant_id === rider.participant_id,
  )
  const place = placeIndex < 0 ? classRiders.length : placeIndex
  const leader = classRiders[0]
  const ahead = place <= 0 ? null : classRiders[place - 1]
  const leaderGap = place <= 0 || !leader ? 0 : gapAtBehindLap(rider, leader)
  const nextGap = ahead == null ? 0 : gapAtBehindLap(rider, ahead)

  return {
    event_id: meta.event_id,
    event_name: meta.event_name,
    race_id: meta.race_id,
    race_num: meta.race_num,
    is_practice: meta.is_practice,
    race_name: meta.race_name,
    session_name: meta.session_name,
    class_id: rider.class_id,
    class_name: rider.class_name,
    place_num: placeLabel(place + 1),
    current_lap_num: rider.currentLapNum,
    status: 'valid',
    participant_id: rider.participant_id,
    participant_plate: rider.participant_plate,
    first_name: rider.first_name,
    last_name: rider.last_name,
    current_lap_time: secondsToRaceTime(rider.lastLapTime, true),
    best_lap_num: rider.bestLapNum,
    best_lap_time: rider.bestLapSec == null ? null : secondsToRaceTime(rider.bestLapSec, true),
    race_elapsed_time: secondsToRaceTime(rider.raceElapsedSec, true),
    leader_gap_time: secondsToRaceTime(leaderGap, true),
    next_gap_time: secondsToRaceTime(nextGap, true),
  }
}

export function createRaceSimulation(options: {
  context: StoredEventContext
  race: EventRaceOrderRow
  participants: SimParticipantSeed[]
  baseLapSec: number
  startedAtMs: number
  /** When set, stop generating laps once every rider reaches this count. */
  maxLaps?: number | null
  /** Initial race status. Manual sims default to Active; demo starts Staging. */
  initialStatus?: RaceStatus
}): RaceSimulation {
  const baseLapSec = clamp(options.baseLapSec, 2, 120)
  const maxLaps = options.maxLaps == null || options.maxLaps <= 0 ? null : options.maxLaps
  const meta = {
    event_id: options.context.eventId,
    event_name: options.context.eventName,
    race_id: options.race.race_id,
    race_num: options.race.race_num,
    is_practice: options.race.is_practice,
    race_name: options.race.race_name,
    session_name: options.race.session_name ?? '',
  }

  const riders: RiderState[] = options.participants.map((seed, index) => {
    const skill = 0.92 + Math.random() * 0.2
    const firstLap = planLapSeconds(baseLapSec, skill) + (index % 7) * (baseLapSec * 0.04)
    return {
      ...seed,
      skill,
      lastCrossingAt: 0,
      nextLapAt: firstLap,
      pendingLapTime: firstLap,
      lastLapTime: firstLap,
      currentLapNum: 0,
      bestLapSec: null,
      bestLapNum: null,
      raceElapsedSec: 0,
      elapsedAtLap: new Map(),
    }
  })

  let timingRows: ActiveRaceTiming[] = options.participants.map((seed) => emptyTimingRow(seed, meta))
  let status: RaceStatus = options.initialStatus ?? 'Active'
  let race = buildRaceHeader(options.context, options.race, secondsToRaceTime(0, false), status)
  /** Elapsed race seconds accumulated before the current running segment. */
  let elapsedOffsetSec = 0
  /** Wall-clock start of the current running segment (Active only). */
  let runningFromMs = options.startedAtMs
  let paused = false
  /** Status before pause (Staging stays Staging visually while the hold timer freezes). */
  let statusBeforePause: RaceStatus | null = null

  function raceElapsedAt(nowMs: number): number {
    if (status === 'Staging' || status === 'Finished') return elapsedOffsetSec
    if (paused) return elapsedOffsetSec
    return Math.max(0, elapsedOffsetSec + (nowMs - runningFromMs) / 1000)
  }

  function riderDone(rider: RiderState): boolean {
    return maxLaps != null && rider.currentLapNum >= maxLaps
  }

  function completeLap(rider: RiderState, atSec: number) {
    if (riderDone(rider)) return
    const lapTime = rider.pendingLapTime
    rider.currentLapNum += 1
    rider.lastCrossingAt = atSec
    rider.raceElapsedSec = atSec
    rider.lastLapTime = lapTime
    rider.elapsedAtLap.set(rider.currentLapNum, atSec)
    if (rider.bestLapSec == null || lapTime < rider.bestLapSec) {
      rider.bestLapSec = lapTime
      rider.bestLapNum = rider.currentLapNum
    }
    if (riderDone(rider)) {
      // No more laps planned for this rider.
      rider.nextLapAt = Number.POSITIVE_INFINITY
    } else {
      const next = planLapSeconds(baseLapSec, rider.skill)
      rider.pendingLapTime = next
      rider.nextLapAt = atSec + next
    }
    // Append a new frozen row; never rewrite earlier laps.
    timingRows = [...timingRows, timingRowForCrossing(rider, riders, meta)]
  }

  function applyElapsed(raceElapsedSec: number, nextStatus: RaceStatus): RaceSimulationSnapshot {
    if (nextStatus === 'Active') {
      for (;;) {
        let nextRider: RiderState | null = null
        for (const rider of riders) {
          if (riderDone(rider)) continue
          if (rider.nextLapAt > raceElapsedSec) continue
          if (!nextRider || rider.nextLapAt < nextRider.nextLapAt) nextRider = rider
        }
        if (!nextRider) break
        completeLap(nextRider, nextRider.nextLapAt)
      }
    }

    status = nextStatus
    race = {
      ...race,
      elapsed_race_time: secondsToRaceTime(raceElapsedSec, false),
      status: nextStatus,
    }
    return { race, timingRows }
  }

  function tick(nowMs: number): RaceSimulationSnapshot {
    if (paused) return { race, timingRows }
    if (status === 'Staging' || status === 'Finished') return { race, timingRows }
    return applyElapsed(raceElapsedAt(nowMs), 'Active')
  }

  function pause(nowMs: number): RaceSimulationSnapshot {
    if (paused) return { race, timingRows }
    if (status === 'Finished') return { race, timingRows }
    if (status === 'Active') {
      elapsedOffsetSec = raceElapsedAt(nowMs)
    }
    statusBeforePause = status
    paused = true
    // Keep Staging as Staging so staging alerts stay correct; Active becomes Paused.
    if (status === 'Active') {
      return applyElapsed(elapsedOffsetSec, 'Paused')
    }
    return { race, timingRows }
  }

  function resume(nowMs: number): RaceSimulationSnapshot {
    if (!paused) return { race, timingRows }
    paused = false
    const restore = statusBeforePause ?? 'Active'
    statusBeforePause = null
    if (restore === 'Active' || restore === 'Paused') {
      runningFromMs = nowMs
      return applyElapsed(raceElapsedAt(nowMs), 'Active')
    }
    status = restore
    race = { ...race, status: restore }
    return { race, timingRows }
  }

  function beginActive(nowMs: number): RaceSimulationSnapshot {
    if (status !== 'Staging' && status !== 'Paused') return { race, timingRows }
    paused = false
    statusBeforePause = null
    elapsedOffsetSec = 0
    runningFromMs = nowMs
    return applyElapsed(0, 'Active')
  }

  function finish(nowMs: number): RaceSimulationSnapshot {
    if (!paused && status === 'Active') {
      elapsedOffsetSec = raceElapsedAt(nowMs)
    }
    paused = false
    statusBeforePause = null
    return applyElapsed(elapsedOffsetSec, 'Finished')
  }

  function getSnapshot(): RaceSimulationSnapshot {
    return { race, timingRows }
  }

  function allLapsComplete(): boolean {
    if (maxLaps == null) return false
    if (riders.length === 0) return true
    return riders.every((rider) => rider.currentLapNum >= maxLaps)
  }

  return {
    tick,
    getSnapshot,
    pause,
    resume,
    isPaused: () => paused,
    getStatus: () => status,
    beginActive,
    finish,
    allLapsComplete,
  }
}
