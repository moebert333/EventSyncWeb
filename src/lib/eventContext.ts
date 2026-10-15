const CONTEXT_KEY = 'eventsync.eventContext'
const CODE_KEY = 'eventsync.eventCode'

export type StoredEventContext = {
  code: string
  organizationId: number
  organizationName: string
  seriesId: number
  seriesName: string
  eventId: number
  eventName: string
  eventDate: string | null
  track: string | null
  location: string | null
}

function isStoredContext(value: unknown): value is StoredEventContext {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (
    typeof row.code === 'string' &&
    typeof row.organizationId === 'number' &&
    typeof row.organizationName === 'string' &&
    typeof row.seriesId === 'number' &&
    typeof row.seriesName === 'string' &&
    typeof row.eventId === 'number' &&
    typeof row.eventName === 'string'
  )
}

export function loadEventContext(): StoredEventContext | null {
  try {
    const raw = localStorage.getItem(CONTEXT_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isStoredContext(parsed)) return null
    return {
      ...parsed,
      eventDate: typeof parsed.eventDate === 'string' ? parsed.eventDate : null,
      track: typeof parsed.track === 'string' ? parsed.track : null,
      location: typeof parsed.location === 'string' ? parsed.location : null,
    }
  } catch {
    return null
  }
}

export function saveEventContext(context: StoredEventContext) {
  const json = JSON.stringify(context)
  localStorage.setItem(CONTEXT_KEY, json)
  localStorage.setItem(CODE_KEY, context.code)
  sessionStorage.setItem(CODE_KEY, context.code)
}
