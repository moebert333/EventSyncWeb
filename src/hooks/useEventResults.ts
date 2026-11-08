import { useQuery } from '@tanstack/react-query'
import { formatRaceTitle, placeRank } from '../lib/format'
import { enrichEventResults, maxMotoByClassId } from '../lib/resultsPoints'
import { supabase } from '../lib/supabase'
import type {
  ClassRow,
  EntryParticipant,
  EventClassResult,
  EventPointsRow,
  EventRow,
  Series,
} from '../types/database'

export type ResultsFilter = {
  eventId: number
  className: string | null
  participantId: number | null
  raceId: number | null
}

export type EventRaceOption = {
  race_id: number
  race_num: number
  race_name: string | null
  is_practice: boolean
}

export type EventResultsData = {
  rows: EventClassResult[]
  /** Largest scheduled MOTO n per class_id from Race Order sessions. */
  maxMotoByClass: Record<number, number>
}

function toMaxMotoRecord(map: Map<number, number>): Record<number, number> {
  const record: Record<number, number> = {}
  for (const [classId, maxMoto] of map.entries()) {
    record[classId] = maxMoto
  }
  return record
}

export function raceOptionLabel(race: EventRaceOption): string {
  // Results only list competitive races (practices are filtered out upstream).
  return formatRaceTitle(race.race_num, false, race.race_name)
}

const RESULT_COLUMNS =
  'event_id, event_name, class_id, class_name, overall_place, participant_id, first_name, last_name, participant_plate, make, overall_points, race1_place, race2_place, race3_place, semi1_place, semi2_place, lcq_place, finals_place'

export function useOrgSeries(organizationId: number | null) {
  return useQuery({
    queryKey: ['org-series', organizationId],
    enabled: organizationId != null,
    queryFn: async (): Promise<Series[]> => {
      const { data, error } = await supabase
        .from('series')
        .select('series_id, organization_id, name, description')
        .eq('organization_id', organizationId!)
        .order('name')
      if (error) throw error
      return (data ?? []) as Series[]
    },
  })
}

export function useOrgEvents(seriesIds: number[]) {
  const key = seriesIds.slice().sort((a, b) => a - b).join(',')
  return useQuery({
    queryKey: ['org-events', key],
    enabled: seriesIds.length > 0,
    queryFn: async (): Promise<EventRow[]> => {
      const { data, error } = await supabase
        .from('events')
        .select('event_id, series_id, name, description, date, track, location')
        .in('series_id', seriesIds)
        .order('date', { ascending: false })
      if (error) throw error
      return (data ?? []) as EventRow[]
    },
  })
}

export function useEventClasses(eventId: number | null) {
  return useQuery({
    queryKey: ['event-classes', eventId],
    enabled: eventId != null,
    queryFn: async (): Promise<ClassRow[]> => {
      const { data, error } = await supabase
        .from('classes')
        .select('class_id, class_name, event_id')
        .eq('event_id', eventId!)
        .order('class_name')
      if (error) throw error
      return (data ?? []) as ClassRow[]
    },
  })
}

export function useEventParticipants(eventId: number | null) {
  return useQuery({
    queryKey: ['event-participants', eventId],
    enabled: eventId != null,
    queryFn: async (): Promise<EntryParticipant[]> => {
      const { data, error } = await supabase
        .from('event_entries_view')
        .select('participant_id, first_name, last_name, participant_plate')
        .eq('event_id', eventId!)
      if (error) throw error
      const seen = new Set<number>()
      const riders: EntryParticipant[] = []
      for (const row of (data ?? []) as EntryParticipant[]) {
        if (seen.has(row.participant_id)) continue
        seen.add(row.participant_id)
        riders.push(row)
      }
      riders.sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name))
      return riders
    },
  })
}

export function useEventRaces(eventId: number | null) {
  return useQuery({
    queryKey: ['event-races-results', eventId],
    enabled: eventId != null,
    queryFn: async (): Promise<EventRaceOption[]> => {
      const { data, error } = await supabase
        .from('races')
        .select('race_id, race_num, race_name, is_practice')
        .eq('event_id', eventId!)
        .order('race_num')
      if (error) throw error
      // Practice sessions do not save results — omit them from Results filters.
      return ((data ?? []) as EventRaceOption[]).filter((race) => !race.is_practice)
    },
  })
}

export function useEventResults(filter: ResultsFilter | null) {
  return useQuery({
    queryKey: ['event-results', filter],
    enabled: filter != null,
    queryFn: async (): Promise<EventResultsData> => {
      const eventId = filter!.eventId
      let query = supabase.from('event_class_results').select(RESULT_COLUMNS).eq('event_id', eventId)
      if (filter!.className) {
        query = query.eq('class_name', filter!.className)
      } else if (filter!.participantId != null) {
        // Full standings for every class this participant is entered in / has results in.
        const [entryResult, resultClasses] = await Promise.all([
          supabase
            .from('event_entry')
            .select('class_id')
            .eq('event_id', eventId)
            .eq('participant_id', filter!.participantId),
          supabase
            .from('event_class_results')
            .select('class_id')
            .eq('event_id', eventId)
            .eq('participant_id', filter!.participantId),
        ])
        if (entryResult.error) throw entryResult.error
        if (resultClasses.error) throw resultClasses.error
        const classIds = [
          ...new Set(
            [
              ...((entryResult.data ?? []) as { class_id: number }[]),
              ...((resultClasses.data ?? []) as { class_id: number }[]),
            ].map((row) => row.class_id),
          ),
        ]
        if (classIds.length === 0) return { rows: [], maxMotoByClass: {} }
        query = query.in('class_id', classIds)
      } else if (filter!.raceId != null) {
        const { data: raceClasses, error: raceClassError } = await supabase
          .from('race_class_names')
          .select('class_id')
          .eq('race_id', filter!.raceId)
        if (raceClassError) throw raceClassError
        const classIds = [
          ...new Set(((raceClasses ?? []) as { class_id: number }[]).map((row) => row.class_id)),
        ]
        if (classIds.length === 0) return { rows: [], maxMotoByClass: {} }
        query = query.in('class_id', classIds)
      }

      const [resultsResponse, pointsResponse, racesResponse] = await Promise.all([
        query,
        supabase.from('event_points').select('event_id, position, points').eq('event_id', eventId),
        supabase.from('races').select('race_id, session_name').eq('event_id', eventId),
      ])
      if (resultsResponse.error) throw resultsResponse.error
      if (pointsResponse.error) throw pointsResponse.error
      if (racesResponse.error) throw racesResponse.error

      const raceRows = (racesResponse.data ?? []) as { race_id: number; session_name: string | null }[]
      let maxMotoByClass = new Map<number, number>()
      if (raceRows.length > 0) {
        const raceIds = raceRows.map((race) => race.race_id)
        const { data: raceClasses, error: raceClassError } = await supabase
          .from('race_class_names')
          .select('race_id, class_id')
          .in('race_id', raceIds)
        if (raceClassError) throw raceClassError
        const classIdsByRace = new Map<number, number[]>()
        for (const row of (raceClasses ?? []) as { race_id: number; class_id: number }[]) {
          const list = classIdsByRace.get(row.race_id) ?? []
          list.push(row.class_id)
          classIdsByRace.set(row.race_id, list)
        }
        maxMotoByClass = maxMotoByClassId(
          raceRows.map((race) => ({
            session_name: race.session_name,
            class_ids: classIdsByRace.get(race.race_id) ?? [],
          })),
        )
      }

      const pointsByPosition = new Map<number, number>()
      for (const row of (pointsResponse.data ?? []) as EventPointsRow[]) {
        pointsByPosition.set(row.position, row.points)
      }

      const rows = enrichEventResults(
        (resultsResponse.data ?? []) as EventClassResult[],
        pointsByPosition,
        maxMotoByClass,
      )
      rows.sort(
        (a, b) =>
          a.class_name.localeCompare(b.class_name) ||
          placeRank(a.overall_place) - placeRank(b.overall_place) ||
          a.last_name.localeCompare(b.last_name),
      )
      return { rows, maxMotoByClass: toMaxMotoRecord(maxMotoByClass) }
    },
  })
}
