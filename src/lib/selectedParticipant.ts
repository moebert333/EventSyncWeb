const PARTICIPANT_KEY = 'eventsync.selectedParticipant'

export type StoredSelectedParticipant = {
  eventId: number
  participantId: number
  firstName: string
  lastName: string
  participantPlate: string | null
}

function isStoredParticipant(value: unknown): value is StoredSelectedParticipant {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (
    typeof row.eventId === 'number' &&
    typeof row.participantId === 'number' &&
    typeof row.firstName === 'string' &&
    typeof row.lastName === 'string' &&
    (row.participantPlate === null || typeof row.participantPlate === 'string')
  )
}

export function loadSelectedParticipant(): StoredSelectedParticipant | null {
  try {
    const raw = localStorage.getItem(PARTICIPANT_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isStoredParticipant(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

export function saveSelectedParticipant(participant: StoredSelectedParticipant) {
  localStorage.setItem(PARTICIPANT_KEY, JSON.stringify(participant))
}

export function clearSelectedParticipant() {
  localStorage.removeItem(PARTICIPANT_KEY)
}
