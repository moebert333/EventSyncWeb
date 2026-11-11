import { useQuery } from '@tanstack/react-query'
import {
  dnsPositionFromPoints,
  enrichEventResults,
  statusByPositionFromPoints,
} from '../lib/resultsPoints'
import { supabase } from '../lib/supabase'
import type { EntryParticipant, EventClassResult, EventPointsRow, EventRow } from '../types/database'

const RESULT_COLUMNS =
  'event_id, event_name, class_id, class_name, overall_place, participant_id, first_name, last_name, participant_plate, make, overall_points, race1_place, race2_place, race3_place, semi1_place, semi2_place, lcq_place, finals_place'

/** VITE_DASHBOARD_MAX_EVENTS: positive int caps series events (earliest by date). Unset = all. */
export function dashboardMaxEventsFromEnv(
  value: string | undefined = import.meta.env.VITE_DASHBOARD_MAX_EVENTS,
): number | null {
  if (value == null || value.trim() === '') return null
  const parsed = Number.parseInt(value.trim(), 10)
  if (!Number.isFinite(parsed) || parsed < 1) return null
  return parsed
}

export type SeriesAnalyzePayload = {
  events: EventRow[]
  rows: EventClassResult[]
  riders: EntryParticipant[]
}

export function useSeriesAnalyzeData(seriesId: number | null) {
  const maxEvents = dashboardMaxEventsFromEnv()
  return useQuery({
    queryKey: ['series-analyze', seriesId, maxEvents],
    enabled: seriesId != null,
    queryFn: async (): Promise<SeriesAnalyzePayload> => {
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('event_id, series_id, name, description, date, track, location')
        .eq('series_id', seriesId!)
        .order('date', { ascending: true })
      if (eventError) throw eventError
      const allEvents = (eventData ?? []) as EventRow[]
      const events =
        maxEvents != null ? allEvents.slice(0, maxEvents) : allEvents
      const eventIds = events.map((event) => event.event_id)
      if (eventIds.length === 0) return { events, rows: [], riders: [] }

      const [resultsResponse, pointsResponse, entriesResponse] = await Promise.all([
        supabase.from('event_class_results').select(RESULT_COLUMNS).in('event_id', eventIds),
        supabase
          .from('event_points')
          .select('event_id, position, points, status')
          .in('event_id', eventIds),
        supabase
          .from('event_entries_view')
          .select('participant_id, first_name, last_name, participant_plate, event_id')
          .in('event_id', eventIds),
      ])
      if (resultsResponse.error) throw resultsResponse.error
      if (pointsResponse.error) throw pointsResponse.error
      if (entriesResponse.error) throw entriesResponse.error

      const pointsRows = (pointsResponse.data ?? []) as EventPointsRow[]
      const pointsByEvent = new Map<number, EventPointsRow[]>()
      for (const row of pointsRows) {
        const list = pointsByEvent.get(row.event_id) ?? []
        list.push(row)
        pointsByEvent.set(row.event_id, list)
      }

      const rawRows = (resultsResponse.data ?? []) as EventClassResult[]
      const enriched: EventClassResult[] = []
      for (const event of events) {
        const eventRows = rawRows.filter((row) => row.event_id === event.event_id)
        if (eventRows.length === 0) continue
        const eventPoints = pointsByEvent.get(event.event_id) ?? []
        const pointsByPosition = new Map<number, number>()
        for (const point of eventPoints) {
          pointsByPosition.set(point.position, point.points)
        }
        const dnsPosition = dnsPositionFromPoints(eventPoints)
        // status map kept for future panel use; enrichment uses dns position.
        void statusByPositionFromPoints(eventPoints)
        enriched.push(
          ...enrichEventResults(eventRows, pointsByPosition, new Map(), dnsPosition),
        )
      }

      const seen = new Set<number>()
      const riders: EntryParticipant[] = []
      for (const row of (entriesResponse.data ?? []) as (EntryParticipant & { event_id?: number })[]) {
        if (seen.has(row.participant_id)) continue
        seen.add(row.participant_id)
        riders.push({
          participant_id: row.participant_id,
          first_name: row.first_name,
          last_name: row.last_name,
          participant_plate: row.participant_plate,
        })
      }
      riders.sort(
        (a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name),
      )

      return { events, rows: enriched, riders }
    },
  })
}
