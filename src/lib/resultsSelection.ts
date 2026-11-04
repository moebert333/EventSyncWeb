import type { ResultsFilter } from '../hooks/useEventResults'

const RESULTS_SELECTION_KEY = 'eventsync.resultsSelection'

export type ResultsMode = 'class' | 'participant' | 'race'

export type StoredResultsSelection = {
  seriesFilter: number | 'all'
  eventId: number
  mode: ResultsMode
  className: string
  participantId: number | ''
  raceId: number | ''
  request: ResultsFilter
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

function isStoredResultsSelection(value: unknown): value is StoredResultsSelection {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  if (!(row.seriesFilter === 'all' || typeof row.seriesFilter === 'number')) return false
  if (typeof row.eventId !== 'number') return false
  if (!(row.mode === 'class' || row.mode === 'participant' || row.mode === 'race')) return false
  if (typeof row.className !== 'string') return false
  if (!(row.participantId === '' || typeof row.participantId === 'number')) return false
  if (!(row.raceId === undefined || row.raceId === '' || typeof row.raceId === 'number')) return false
  if (!row.request || typeof row.request !== 'object') return false
  return normalizeResultsFilter(row.request as Record<string, unknown>) != null
}

export function loadResultsSelection(): StoredResultsSelection | null {
  try {
    const raw = localStorage.getItem(RESULTS_SELECTION_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isStoredResultsSelection(parsed)) return null
    const request = normalizeResultsFilter(parsed.request as unknown as Record<string, unknown>)
    if (!request) return null
    return {
      ...parsed,
      raceId: parsed.raceId === undefined ? '' : parsed.raceId,
      request,
    }
  } catch {
    return null
  }
}

export function saveResultsSelection(selection: StoredResultsSelection) {
  localStorage.setItem(RESULTS_SELECTION_KEY, JSON.stringify(selection))
}

/** Point Results page selection at this participant (preserves series filter when possible). */
export function saveParticipantAsResultsSelection(eventId: number, participantId: number) {
  const existing = loadResultsSelection()
  saveResultsSelection({
    seriesFilter: existing?.eventId === eventId ? existing.seriesFilter : 'all',
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
  })
}

export function clearResultsSelection() {
  localStorage.removeItem(RESULTS_SELECTION_KEY)
}
