import { isEventCodeShape } from './codes'
import type { StoredEventContext } from './eventContext'
import { supabase } from './supabase'

type CodeRow = { code: string; event_id: number }
type EventJoin = {
  event_id: number
  name: string
  date: string | null
  track: string | null
  location: string | null
  series_id: number
}
type SeriesJoin = { series_id: number; name: string; organization_id: number }
type OrgJoin = { organization_id: number; name: string }

export async function resolveEventCode(raw: string): Promise<StoredEventContext | null> {
  const code = raw.trim()
  if (!isEventCodeShape(code)) return null

  const codes = await supabase.from('event_codes').select('code, event_id').ilike('code', code).limit(5)
  if (codes.error) throw codes.error
  const matches = ((codes.data ?? []) as CodeRow[]).filter(
    (row) => row.code.toLowerCase() === code.toLowerCase(),
  )
  if (matches.length === 0) return null
  const eventIds = new Set(matches.map((row) => row.event_id))
  if (eventIds.size > 1) throw new Error('More than one event uses that code.')
  const match = matches[0]
  if (!match) return null

  const eventResult = await supabase
    .from('events')
    .select('event_id, name, date, track, location, series_id')
    .eq('event_id', match.event_id)
    .maybeSingle()
  if (eventResult.error) throw eventResult.error
  const event = eventResult.data as EventJoin | null
  if (!event) return null

  const seriesResult = await supabase
    .from('series')
    .select('series_id, name, organization_id')
    .eq('series_id', event.series_id)
    .maybeSingle()
  if (seriesResult.error) throw seriesResult.error
  const series = seriesResult.data as SeriesJoin | null
  if (!series) return null

  const orgResult = await supabase
    .from('organizations')
    .select('organization_id, name')
    .eq('organization_id', series.organization_id)
    .maybeSingle()
  if (orgResult.error) throw orgResult.error
  const organization = orgResult.data as OrgJoin | null
  if (!organization) return null

  return {
    code: match.code,
    organizationId: organization.organization_id,
    organizationName: organization.name,
    seriesId: series.series_id,
    seriesName: series.name,
    eventId: event.event_id,
    eventName: event.name,
    eventDate: event.date,
    track: event.track,
    location: event.location,
  }
}
