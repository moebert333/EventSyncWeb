import { useQuery } from '@tanstack/react-query'
import { placeRank } from '../lib/format'
import { supabase } from '../lib/supabase'
import type { ClassRow, EntryParticipant, EventClassResult, EventRow, Series } from '../types/database'

export type ResultsFilter = {
  eventId: number
  className: string | null
  participantId: number | null
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

export function useEventResults(filter: ResultsFilter | null) {
  return useQuery({
    queryKey: ['event-results', filter],
    enabled: filter != null,
    queryFn: async (): Promise<EventClassResult[]> => {
      let query = supabase.from('event_class_results').select(RESULT_COLUMNS).eq('event_id', filter!.eventId)
      if (filter!.className) query = query.eq('class_name', filter!.className)
      if (filter!.participantId != null) query = query.eq('participant_id', filter!.participantId)
      const { data, error } = await query
      if (error) throw error
      const rows = (data ?? []) as EventClassResult[]
      rows.sort(
        (a, b) =>
          a.class_name.localeCompare(b.class_name) ||
          placeRank(a.overall_place) - placeRank(b.overall_place) ||
          a.last_name.localeCompare(b.last_name),
      )
      return rows
    },
  })
}
