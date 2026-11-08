import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { isEventCodeShape } from '../lib/codes'
import {
  clearEventContext,
  loadEventContext,
  saveEventContext,
  type StoredEventContext,
} from '../lib/eventContext'
import { EventCodeReactContext, type EventCodeApi } from '../lib/eventCodeContext'
import { resolveEventCode } from '../lib/resolveEventCode'
import {
  clearSelectedParticipant,
  loadSelectedParticipant,
  saveSelectedParticipant,
  type StoredSelectedParticipant,
} from '../lib/selectedParticipant'

function participantForEvent(
  participant: StoredSelectedParticipant | null,
  eventId: number | null,
): StoredSelectedParticipant | null {
  if (!participant || eventId == null) return null
  return participant.eventId === eventId ? participant : null
}

export function EventCodeProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<StoredEventContext | null>(() => loadEventContext())
  const [selectedParticipant, setSelectedParticipantState] = useState<StoredSelectedParticipant | null>(() =>
    participantForEvent(loadSelectedParticipant(), loadEventContext()?.eventId ?? null),
  )
  const [error, setError] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)

  useEffect(() => {
    const stored = loadEventContext()
    if (!stored) return
    let cancelled = false
    resolveEventCode(stored.code)
      .then((fresh) => {
        if (cancelled) return
        if (!fresh) {
          // Code no longer exists in event_codes (or event chain broke) — drop stale home context.
          clearEventContext()
          clearSelectedParticipant()
          setContext(null)
          setSelectedParticipantState(null)
          return
        }
        saveEventContext(fresh)
        setContext(fresh)
        const kept = participantForEvent(loadSelectedParticipant(), fresh.eventId)
        if (!kept) clearSelectedParticipant()
        setSelectedParticipantState(kept)
      })
      .catch(() => {
        // Keep the stored event when the track connection is down.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const setSelectedParticipant = useCallback((participant: StoredSelectedParticipant | null) => {
    if (!participant) {
      clearSelectedParticipant()
      setSelectedParticipantState(null)
      return
    }
    saveSelectedParticipant(participant)
    setSelectedParticipantState(participant)
  }, [])

  const submitCode = useCallback(async (raw: string) => {
    const code = raw.trim()
    if (!isEventCodeShape(code)) {
      setError('Event Codes are 4–12 characters.')
      return false
    }
    setResolving(true)
    try {
      const resolved = await resolveEventCode(code)
      if (!resolved) {
        setError('That Event Code was not found')
        return false
      }
      const previousEventId = loadEventContext()?.eventId
      saveEventContext(resolved)
      setContext(resolved)
      if (previousEventId !== resolved.eventId) {
        clearSelectedParticipant()
        setSelectedParticipantState(null)
      } else {
        setSelectedParticipantState(participantForEvent(loadSelectedParticipant(), resolved.eventId))
      }
      setError(null)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not look up that Event Code.')
      return false
    } finally {
      setResolving(false)
    }
  }, [])

  const clearError = useCallback(() => setError(null), [])

  const api = useMemo<EventCodeApi>(
    () => ({
      context,
      selectedParticipant,
      setSelectedParticipant,
      error,
      resolving,
      submitCode,
      clearError,
    }),
    [context, selectedParticipant, setSelectedParticipant, error, resolving, submitCode, clearError],
  )

  return <EventCodeReactContext.Provider value={api}>{children}</EventCodeReactContext.Provider>
}
