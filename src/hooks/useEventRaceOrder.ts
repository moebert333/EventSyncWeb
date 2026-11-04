import { useQuery } from '@tanstack/react-query'
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
  return useQuery({
    queryKey: ['event-race-order', eventId],
    enabled: eventId != null,
    queryFn: async (): Promise<EventRaceOrderRow[]> => {
      const racesResult = await supabase
        .from('races')
        .select('race_id, race_num, race_name, session_name, active, completed')
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

/** Race numbers the participant is entered in for this event (via event_entry → race_class). */
export function useParticipantRaceNums(eventId: number | null, participantId: number | null) {
  return useQuery({
    queryKey: ['participant-race-nums', eventId, participantId],
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
        .select('race_id, races!inner(event_id, race_num)')
        .in('class_id', classIds)
        .eq('races.event_id', eventId!)
      if (raceClasses.error) throw raceClasses.error

      const nums = new Set<number>()
      for (const row of raceClasses.data ?? []) {
        const related = (row as { races: { race_num: number } | { race_num: number }[] }).races
        const raceNum = Array.isArray(related) ? related[0]?.race_num : related?.race_num
        if (raceNum != null) nums.add(raceNum)
      }
      return [...nums].sort((a, b) => a - b)
    },
    refetchInterval: 5000,
  })
}

export type RaceProgressLine =
  | { kind: 'first'; raceNum: number }
  | { kind: 'active'; activeNum: number; nextNum: number }

/** Active + next participant race, or first race when nothing is active. */
export function raceProgressLine(
  races: EventRaceOrderRow[],
  participantRaceNums: number[],
): RaceProgressLine | null {
  if (participantRaceNums.length === 0) return null
  const sorted = participantRaceNums.slice().sort((a, b) => a - b)
  const activeRace = races.find((race) => race.active)
  if (!activeRace) {
    return { kind: 'first', raceNum: sorted[0]! }
  }
  const nextNum = sorted.find((num) => num >= activeRace.race_num)
  if (nextNum == null) return null
  return { kind: 'active', activeNum: activeRace.race_num, nextNum }
}

export function raceProgressMessage(line: RaceProgressLine): string {
  if (line.kind === 'first') return `Your first race is number ${line.raceNum}.`
  return `Active Race: ${line.activeNum}, your next race is number ${line.nextNum}`
}

/**
 * Races from the current active race up to the participant's next race (by race_num).
 * Requires a race with `active` (Staging / Active / Paused / Finished until the next activates).
 * Returns `null` when the label should be hidden, `'completed'` when the rider has no races left.
 */
export function stagingInRaces(
  races: EventRaceOrderRow[],
  participantRaceNums: number[],
): number | 'completed' | null {
  if (races.length === 0 || participantRaceNums.length === 0) return null

  // Keep the last activated race marked active until another takes over.
  const activeRace = races.find((race) => race.active)
  if (!activeRace) return null

  const nextNum = participantRaceNums
    .filter((num) => num >= activeRace.race_num)
    .sort((a, b) => a - b)[0]

  if (nextNum == null) return 'completed'
  return Math.max(0, nextNum - activeRace.race_num)
}

export function stagingLabelText(
  stagingIn: number | 'completed' | null,
  raceStatus?: RaceStatus | null,
): string | null {
  if (stagingIn === 'completed') return 'Your races are completed'
  if (stagingIn === 0) return `Your race is ${raceStatus ?? 'Active'}`
  if (stagingIn === 1 || stagingIn === 2) return 'Your Race is Staging'
  if (stagingIn != null) return `Staging in: ${stagingIn - 2} Races`
  return null
}
