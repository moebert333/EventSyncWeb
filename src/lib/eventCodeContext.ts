import { createContext, useContext } from 'react'
import type { StoredEventContext } from './eventContext'

export type EventCodeApi = {
  context: StoredEventContext | null
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
