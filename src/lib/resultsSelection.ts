import type { ResultsFilter } from '../hooks/useEventResults'

const RESULTS_SELECTION_KEY = 'eventsync.resultsSelection'

export type ResultsMode = 'class' | 'participant' | 'race'
export type ResultsScope = 'event' | 'series'

export type SeriesResultsRequest = {
  seriesId: number
  className: string | null
  participantId: number | null
}

export type StoredResultsSelection = {
  scope: ResultsScope
  seriesFilter: number | 'all'
  eventId: number
  mode: ResultsMode
  className: string
  participantId: number | ''
  raceId: number | ''
  /** Event-results request; null when scope is series. */
  request: ResultsFilter | null
  /** Series-standings request; null when scope is event. */
  seriesRequest: SeriesResultsRequest | null
}

function normalizeResultsFilter(value: Record<string, unknown>): ResultsFilter | null {
  if (typeof value.eventId !== 'number') return null
  if (!(value.className === null || typeof value.className === 'string')) return null
  if (!(value.participantId === null || typeof value.participantId === 'number')) return null
  if (!(value.raceId === undefined || value.raceId === null || typeof value.raceId === 'number')) return null
  return {
    eventId: value.eventId,
    className: value.className,
    participantId: value.participantId,
    raceId: typeof value.raceId === 'number' ? value.raceId : null,
  }
}

function normalizeSeriesRequest(value: unknown): SeriesResultsRequest | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (typeof row.seriesId !== 'number') return null
  if (!(row.className === null || typeof row.className === 'string')) return null
  if (!(row.participantId === null || typeof row.participantId === 'number')) return null
  return {
    seriesId: row.seriesId,
    className: row.className,
    participantId: row.participantId,
  }
}

function isStoredResultsSelection(value: unknown): value is StoredResultsSelection {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  const scope = row.scope === 'series' ? 'series' : 'event'
  if (!(row.seriesFilter === 'all' || typeof row.seriesFilter === 'number')) return false
  if (typeof row.eventId !== 'number') return false
  if (!(row.mode === 'class' || row.mode === 'participant' || row.mode === 'race')) return false
  if (scope === 'series' && row.mode === 'race') return false
  if (scope === 'series' && typeof row.seriesFilter !== 'number') return false
  if (typeof row.className !== 'string') return false
  if (!(row.participantId === '' || typeof row.participantId === 'number')) return false
  if (!(row.raceId === undefined || row.raceId === '' || typeof row.raceId === 'number')) return false

  if (scope === 'series') {
    return normalizeSeriesRequest(row.seriesRequest) != null
  }

  // Legacy rows stored `request` only (no scope / seriesRequest).
  if (!row.request || typeof row.request !== 'object') return false
  return normalizeResultsFilter(row.request as Record<string, unknown>) != null
}

export function loadResultsSelection(): StoredResultsSelection | null {
  try {
    const raw = localStorage.getItem(RESULTS_SELECTION_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isStoredResultsSelection(parsed)) return null
    const scope: ResultsScope = parsed.scope === 'series' ? 'series' : 'event'
    if (scope === 'series') {
      const seriesRequest = normalizeSeriesRequest(parsed.seriesRequest)
      if (!seriesRequest) return null
      return {
        scope,
        seriesFilter: parsed.seriesFilter,
        eventId: parsed.eventId,
        mode: parsed.mode,
        className: parsed.className,
        participantId: parsed.participantId,
        raceId: '',
        request: null,
        seriesRequest,
      }
    }
    const request = normalizeResultsFilter(parsed.request as unknown as Record<string, unknown>)
    if (!request) return null
    return {
      scope: 'event',
      seriesFilter: parsed.seriesFilter,
      eventId: parsed.eventId,
      mode: parsed.mode,
      className: parsed.className,
      participantId: parsed.participantId,
      raceId: parsed.raceId === undefined ? '' : parsed.raceId,
      request,
      seriesRequest: null,
    }
  } catch {
    return null
  }
}

export function saveResultsSelection(selection: StoredResultsSelection) {
  localStorage.setItem(RESULTS_SELECTION_KEY, JSON.stringify(selection))
}

function seriesFilterForEvent(
  eventId: number,
  seriesId: number | null | undefined,
  existing: StoredResultsSelection | null,
): number | 'all' {
  if (seriesId != null) return seriesId
  if (existing?.eventId === eventId) return existing.seriesFilter
  return 'all'
}

/** Point Results page selection at this participant (series defaults to current event series). */
export function saveParticipantAsResultsSelection(
  eventId: number,
  participantId: number,
  seriesId?: number | null,
) {
  const existing = loadResultsSelection()
  saveResultsSelection({
    scope: 'event',
    seriesFilter: seriesFilterForEvent(eventId, seriesId, existing),
    eventId,
    mode: 'participant',
    className: '',
    participantId,
    raceId: '',
    request: {
      eventId,
      className: null,
      participantId,
      raceId: null,
    },
    seriesRequest: null,
  })
}

/** Point Results page selection at this race (series defaults to current event series). */
export function saveRaceAsResultsSelection(
  eventId: number,
  raceId: number,
  seriesId?: number | null,
) {
  const existing = loadResultsSelection()
  saveResultsSelection({
    scope: 'event',
    seriesFilter: seriesFilterForEvent(eventId, seriesId, existing),
    eventId,
    mode: 'race',
    className: '',
    participantId: '',
    raceId,
    request: {
      eventId,
      className: null,
      participantId: null,
      raceId,
    },
    seriesRequest: null,
  })
}

export function clearResultsSelection() {
  localStorage.removeItem(RESULTS_SELECTION_KEY)
}
