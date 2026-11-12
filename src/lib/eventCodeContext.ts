import { createContext, useContext } from 'react'
import type { StoredEventContext } from './eventContext'
import type { StoredSelectedParticipant } from './selectedParticipant'

export type EventCodeApi = {
  context: StoredEventContext | null
  selectedParticipant: StoredSelectedParticipant | null
  setSelectedParticipant: (participant: StoredSelectedParticipant | null) => void
  error: string | null
  resolving: boolean
  /** Resolved context on success; `null` when the code was rejected or lookup failed. */
  submitCode: (raw: string) => Promise<StoredEventContext | null>
  clearError: () => void
}

export const EventCodeReactContext = createContext<EventCodeApi | null>(null)

export function useEventCode(): EventCodeApi {
  const value = useContext(EventCodeReactContext)
  if (!value) throw new Error('useEventCode must be used within EventCodeProvider')
  return value
}
