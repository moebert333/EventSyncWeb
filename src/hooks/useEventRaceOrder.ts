import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { applyRaceOrderOverlay } from '../lib/demoSimulation'
import { useSimulationOptional } from '../lib/simulationContext'
import { supabase } from '../lib/supabase'
import type {
  EntryParticipant,
  EventRaceOrderClass,
  EventRaceOrderRow,
  RaceStatus,
} from '../types/database'

type RaceRow = {
  race_id: number
  race_num: number
  is_practice: boolean | null
  race_name: string | null
  session_name: string | null
  active: boolean | null
  completed: boolean | null
}

type StatusRow = {
  race_id: number
  status: RaceStatus | null
}

type RaceClassNameRow = {
  race_id: number
  class_id: number
  class_name: string
}

type ClassEntryRow = {
  participant_id: number
  participant_plate: string | null
  participants:
    | { first_name: string; last_name: string }
    | { first_name: string; last_name: string }[]
    | null
}

function participantName(related: ClassEntryRow['participants']): { first_name: string; last_name: string } | null {
  if (!related) return null
  if (Array.isArray(related)) return related[0] ?? null
  return related
}

export function useEventRaceOrder(eventId: number | null) {
  const simulation = useSimulationOptional()
  const query = useQuery({
    queryKey: ['event-race-order', eventId],
    enabled: eventId != null,
    queryFn: async (): Promise<EventRaceOrderRow[]> => {
      const racesResult = await supabase
        .from('races')
        .select('race_id, race_num, is_practice, race_name, session_name, active, completed')
        .eq('event_id', eventId!)
        .order('race_num')
      if (racesResult.error) throw racesResult.error
      const races = (racesResult.data ?? []) as RaceRow[]
      if (races.length === 0) return []

      const raceIds = races.map((race) => race.race_id)
      const [classesResult, statusResult] = await Promise.all([
        supabase.from('race_class_names').select('race_id, class_id, class_name').in('race_id', raceIds),
        supabase.from('status').select('race_id, status').in('race_id', raceIds),
      ])
      if (classesResult.error) throw classesResult.error
      if (statusResult.error) throw statusResult.error

      const classesByRace = new Map<number, EventRaceOrderClass[]>()
      for (const row of (classesResult.data ?? []) as RaceClassNameRow[]) {
        const list = classesByRace.get(row.race_id) ?? []
        if (!list.some((item) => item.class_id === row.class_id)) {
          list.push({ class_id: row.class_id, class_name: row.class_name })
        }
        classesByRace.set(row.race_id, list)
      }

      const statusByRace = new Map<number, RaceStatus | null>()
      for (const row of (statusResult.data ?? []) as StatusRow[]) {
        statusByRace.set(row.race_id, row.status)
      }

      return races.map((race) => ({
        race_id: race.race_id,
        race_num: race.race_num,
        is_practice: Boolean(race.is_practice),
        race_name: race.race_name,
        session_name: race.session_name,
        active: Boolean(race.active),
        completed: Boolean(race.completed),
        status: statusByRace.get(race.race_id) ?? null,
        classes: (classesByRace.get(race.race_id) ?? [])
          .slice()
          .sort((a, b) => a.class_name.localeCompare(b.class_name)),
      }))
    },
    refetchInterval: 5000,
  })

  const overlay =
    simulation?.isActive &&
    simulation.isDemoMode &&
    simulation.eventId === eventId &&
    simulation.raceOrderOverlay
      ? simulation.raceOrderOverlay
      : null

  const data = useMemo(() => {
    if (!query.data || !overlay) return query.data
    return applyRaceOrderOverlay(query.data, overlay)
  }, [query.data, overlay])

  return { ...query, data }
}

/** Participants entered in a class for an event. */
export function useClassParticipants(eventId: number | null, classId: number | null) {
  return useQuery({
    queryKey: ['class-participants', eventId, classId],
    enabled: eventId != null && classId != null,
    queryFn: async (): Promise<EntryParticipant[]> => {
      const { data, error } = await supabase
        .from('event_entry')
        .select('participant_id, participant_plate, participants(first_name, last_name)')
        .eq('event_id', eventId!)
        .eq('class_id', classId!)
      if (error) throw error

      const riders: EntryParticipant[] = []
      const seen = new Set<number>()
      for (const row of (data ?? []) as ClassEntryRow[]) {
        if (seen.has(row.participant_id)) continue
        const name = participantName(row.participants)
        if (!name) continue
        seen.add(row.participant_id)
        riders.push({
          participant_id: row.participant_id,
          first_name: name.first_name,
          last_name: name.last_name,
          participant_plate: row.participant_plate,
        })
      }
      riders.sort(
        (a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name),
      )
      return riders
    },
  })
}

/** Race ids the participant is entered in for this event (via event_entry → race_class). */
export function useParticipantRaceNums(eventId: number | null, participantId: number | null) {
  return useQuery({
    queryKey: ['participant-race-ids', eventId, participantId],
    enabled: eventId != null && participantId != null,
    queryFn: async (): Promise<number[]> => {
      const entries = await supabase
        .from('event_entry')
        .select('class_id')
        .eq('event_id', eventId!)
        .eq('participant_id', participantId!)
      if (entries.error) throw entries.error
      const classIds = [...new Set((entries.data ?? []).map((row) => row.class_id as number))]
      if (classIds.length === 0) return []

      const raceClasses = await supabase
        .from('race_class')
        .select('race_id, races!inner(event_id)')
        .in('class_id', classIds)
        .eq('races.event_id', eventId!)
      if (raceClasses.error) throw raceClasses.error

      const ids = new Set<number>()
      for (const row of raceClasses.data ?? []) {
        const raceId = (row as { race_id: number }).race_id
        if (raceId != null) ids.add(raceId)
      }
      return [...ids].sort((a, b) => a - b)
    },
    refetchInterval: 5000,
  })
}

/** Races (or practices) matching the active session type. */
function sessionPool(races: EventRaceOrderRow[], isPractice: boolean): EventRaceOrderRow[] {
  return races.filter((race) => race.is_practice === isPractice)
}

/** Participant race/practice numbers within a session pool, sorted by race_num. */
function participantSessionNums(
  pool: EventRaceOrderRow[],
  participantRaceIds: number[],
): number[] {
  const idSet = new Set(participantRaceIds)
  return pool
    .filter((race) => idSet.has(race.race_id))
    .map((race) => race.race_num)
    .sort((a, b) => a - b)
}

export type WarningDetailStyle = 'none' | 'yellow' | 'yellowFlash'

export type RaceProgressLine =
  | { kind: 'first'; raceNum: number; isPractice: boolean }
  /** Not in the active session; next session still ahead. */
  | {
      kind: 'active'
      activeNum: number
      nextNum: number
      /** Event race_num gap: nextNum - activeNum. */
      racesAway: number
      isPractice: boolean
    }
  /** In the active session with no later session in the pool. */
  | {
      kind: 'inThisRace'
      activeNum: number
      nextNum?: undefined
      isPractice: boolean
      status: RaceStatus
    }
  /** In the active session with a later session still ahead. */
  | {
      kind: 'inThisRaceWithNext'
      activeNum: number
      nextNum: number
      isPractice: boolean
      status: RaceStatus
    }
  /** Rider has no remaining sessions in the current practice/race pool. */
  | { kind: 'completed'; isPractice: boolean }

/** True when the active race has started or finished (not still Staging). */
function activeRacePastStaging(status: RaceStatus | null | undefined): boolean {
  return status === 'Active' || status === 'Paused' || status === 'Finished'
}

function isLiveInRaceStatus(status: RaceStatus | null | undefined): boolean {
  return status === 'Active' || status === 'Paused'
}

function sessionWord(isPractice: boolean, capitalize: boolean): string {
  if (capitalize) return isPractice ? 'Practice' : 'Race'
  return isPractice ? 'practice' : 'race'
}

/** Small words left lowercase in progress-line title case (unless first in a sentence). */
const PROGRESS_SMALL_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'in',
  'on',
  'of',
  'to',
  'for',
  'at',
  'by',
  'as',
  'is',
  'are',
  'was',
  'were',
  'be',
  'this',
  'that',
])

/** Title-case progress copy: capitalize words except small ones; always capitalize sentence starts. */
export function titleCaseProgressLine(text: string): string {
  return text.replace(/[^.!?]+[.!?]*/g, (sentence) => {
    const leading = sentence.match(/^\s*/)?.[0] ?? ''
    const body = sentence.slice(leading.length)
    if (!body) return sentence
    let firstWord = true
    const cased = body.replace(/\b([A-Za-z][A-Za-z']*)\b/g, (word) => {
      const lower = word.toLowerCase()
      const cap = lower.charAt(0).toUpperCase() + lower.slice(1)
      if (firstWord) {
        firstWord = false
        return cap
      }
      if (PROGRESS_SMALL_WORDS.has(lower)) return lower
      return cap
    })
    return leading + cased
  })
}

/**
 * Active + next participant session, or first competitive race when nothing is active.
 * When a practice is active, counts practices only; when a normal race is active, races only.
 * When nothing is active, always uses competitive races (never Practice) for the Title Box.
 */
export function raceProgressLine(
  races: EventRaceOrderRow[],
  participantRaceIds: number[],
): RaceProgressLine | null {
  const activeRace = races.find((race) => race.active) ?? null
  if (!activeRace) {
    // Rule 1: first competitive Race only (not Practice). Blank if rider has none.
    const racePool = sessionPool(races, false)
    const sortedRaces = participantSessionNums(racePool, participantRaceIds)
    if (sortedRaces.length === 0) return null
    return { kind: 'first', raceNum: sortedRaces[0]!, isPractice: false }
  }

  const isPractice = activeRace.is_practice
  const pool = sessionPool(races, isPractice)
  const sorted = participantSessionNums(pool, participantRaceIds)
  if (sorted.length === 0) return null

  const status = activeRace.status ?? 'Staging'
  const inActiveRace = participantRaceIds.includes(activeRace.race_id)
  // In the active session (Staging / Active / Paused / Finished): next vs last for the header.
  if (
    inActiveRace &&
    (status === 'Staging' || activeRacePastStaging(status))
  ) {
    const nextNum = sorted.find((num) => num > activeRace.race_num)
    if (nextNum == null) {
      return { kind: 'inThisRace', activeNum: activeRace.race_num, isPractice, status }
    }
    return {
      kind: 'inThisRaceWithNext',
      activeNum: activeRace.race_num,
      nextNum,
      isPractice,
      status,
    }
  }

  const nextNum = sorted.find((num) => num >= activeRace.race_num)
  if (nextNum == null) return { kind: 'completed', isPractice }
  return {
    kind: 'active',
    activeNum: activeRace.race_num,
    nextNum,
    racesAway: nextNum - activeRace.race_num,
    isPractice,
  }
}

function noMoreSessionsDetail(isPractice: boolean): string {
  const Units = isPractice ? 'Practices' : 'Races'
  return titleCaseProgressLine(`You have no more ${Units}`)
}

function nextSessionDetail(isPractice: boolean, nextNum: number): string {
  const unit = sessionWord(isPractice, false)
  return titleCaseProgressLine(`Your next ${unit} is ${nextNum}`)
}

function inThisSessionDetail(isPractice: boolean): string {
  const Unit = sessionWord(isPractice, true)
  return titleCaseProgressLine(`You are in this ${Unit}`)
}

/** Title like "Active Race 1" plus the remaining status detail for the header strip. */
export function raceProgressParts(line: RaceProgressLine): {
  title: string | null
  detail: string
  detailStyle: WarningDetailStyle
} {
  const unit = sessionWord(line.isPractice, false)
  const Unit = sessionWord(line.isPractice, true)
  if (line.kind === 'first') {
    return {
      title: null,
      // Rule 1 always uses Race (isPractice forced false above).
      detail: titleCaseProgressLine(`Your first ${unit} is ${line.raceNum}`),
      detailStyle: 'none',
    }
  }
  if (line.kind === 'completed') {
    return { title: null, detail: noMoreSessionsDetail(line.isPractice), detailStyle: 'none' }
  }
  const title = `Active ${Unit} ${line.activeNum}`
  if (line.kind === 'inThisRace') {
    // 4a Staging + no more → "You are in this Race" yellow flash.
    // 4b/4c Active/Paused/Finished + no more → "You Have No More Races".
    if (line.status === 'Staging') {
      return { title, detail: inThisSessionDetail(line.isPractice), detailStyle: 'yellowFlash' }
    }
    return { title, detail: noMoreSessionsDetail(line.isPractice), detailStyle: 'none' }
  }
  if (line.kind === 'inThisRaceWithNext') {
    return {
      title,
      detail: nextSessionDetail(line.isPractice, line.nextNum),
      detailStyle: 'none',
    }
  }
  // Not in current race: yellow (not flashing) when 1–2 race_num away.
  const detailStyle: WarningDetailStyle =
    line.racesAway === 1 || line.racesAway === 2 ? 'yellow' : 'none'
  return {
    title,
    detail: nextSessionDetail(line.isPractice, line.nextNum),
    detailStyle,
  }
}

export function raceProgressMessage(line: RaceProgressLine): string {
  const Unit = sessionWord(line.isPractice, true)
  const parts = raceProgressParts(line)
  // Race Order popup still leads with "You are in this Race" when applicable.
  if (line.kind === 'inThisRace' || line.kind === 'inThisRaceWithNext') {
    const inThis = titleCaseProgressLine(`You are in this ${Unit}!`)
    if (line.kind === 'inThisRace' && line.status === 'Staging') {
      // Detail is the same phrase without "!"; avoid duplicating.
      return parts.title == null ? inThis : `${parts.title}, ${inThis}`
    }
    if (parts.title == null) return `${inThis} ${parts.detail}`
    return `${parts.title}, ${inThis} ${parts.detail}`
  }
  if (parts.title == null) return parts.detail
  return `${parts.title}, ${parts.detail}`
}

export type StagingInResult = number | 'completed' | 'inThisRace' | null

/**
 * Popup urgency from the current active race/practice up to the participant's next one (by race_num).
 * Scoped to practices when the active session is a practice; otherwise competitive races.
 * - In active Staging → 0 ("Your Race/Practice is Staging")
 * - In active Active/Paused → `'inThisRace'` ("You are in this Race/Practice")
 * - In active Finished, or not in active: race_num gap to next (1|2 → Staging popup; >2 → hidden)
 * Returns `null` when the popup should be hidden, `'completed'` when the rider has no sessions left.
 */
export function stagingInRaces(
  races: EventRaceOrderRow[],
  participantRaceIds: number[],
): StagingInResult {
  if (participantRaceIds.length === 0) return null

  // Keep the last activated race marked active until another takes over.
  const activeRace = races.find((race) => race.active)
  if (!activeRace) return null

  const pool = sessionPool(races, activeRace.is_practice)
  if (pool.length === 0) return null

  const sorted = participantSessionNums(pool, participantRaceIds)
  if (sorted.length === 0) return null
  const inActiveRace = participantRaceIds.includes(activeRace.race_id)

  if (inActiveRace && activeRace.status === 'Staging') return 0
  // Finished does not keep the "in this race" popup; fall through for 1–2-away Staging popup.
  if (inActiveRace && isLiveInRaceStatus(activeRace.status)) return 'inThisRace'

  const nextNum = sorted.find((num) =>
    inActiveRace ? num > activeRace.race_num : num >= activeRace.race_num,
  )
  if (nextNum == null) return 'completed'
  return Math.max(0, nextNum - activeRace.race_num)
}

/**
 * Warning Popup copy. All strings are title-cased.
 * Only 0 / 1 / 2 / 'inThisRace' are shown as a popup (see StagingAlert).
 */
export function stagingLabelText(
  stagingIn: StagingInResult,
  isPractice = false,
): string | null {
  const Unit = sessionWord(isPractice, true)
  if (stagingIn === 'completed') return null
  if (stagingIn === 'inThisRace') {
    return titleCaseProgressLine(`You are in this ${Unit}`)
  }
  if (stagingIn === 0) {
    // Participant is in the Staging active session.
    return titleCaseProgressLine(`Your ${Unit} is Staging`)
  }
  if (stagingIn === 1 || stagingIn === 2) {
    return titleCaseProgressLine(`Your next ${Unit} is Staging`)
  }
  // >2 away: no popup (legacy "Staging in: N" removed).
  return null
}
