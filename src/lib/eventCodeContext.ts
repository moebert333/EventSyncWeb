import { createContext, useContext } from 'react'
import type { StoredEventContext } from './eventContext'
import type { StoredSelectedParticipant } from './selectedParticipant'

export type EventCodeApi = {
  context: StoredEventContext | null
  selectedParticipant: StoredSelectedParticipant | null
  setSelectedParticipant: (participant: StoredSelectedParticipant | null) => void
  error: string | null
  resolving: boolean
  submitCode: (raw: string) => Promise<boolean>
  clearError: () => void
}

export const EventCodeReactContext = createContext<EventCodeApi | null>(null)

export function useEventCode(): EventCodeApi {
  const value = useContext(EventCodeReactContext)
  if (!value) throw new Error('useEventCode must be used within EventCodeProvider')
  return value
}
