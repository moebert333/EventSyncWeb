import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { isEventCodeShape } from '../lib/codes'
import { loadEventContext, saveEventContext, type StoredEventContext } from '../lib/eventContext'
import { EventCodeReactContext, type EventCodeApi } from '../lib/eventCodeContext'
import { resolveEventCode } from '../lib/resolveEventCode'

export function EventCodeProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<StoredEventContext | null>(() => loadEventContext())
  const [error, setError] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)

  useEffect(() => {
    const stored = loadEventContext()
    if (!stored) return
    let cancelled = false
    resolveEventCode(stored.code)
      .then((fresh) => {
        if (cancelled || !fresh) return
        saveEventContext(fresh)
        setContext(fresh)
      })
      .catch(() => {
        // Keep the stored event when the track connection is down.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const submitCode = useCallback(async (raw: string) => {
    const code = raw.trim()
    if (!isEventCodeShape(code)) {
      setError('Event Codes are 6–12 characters.')
      return false
    }
    setResolving(true)
    try {
      const resolved = await resolveEventCode(code)
      if (!resolved) {
        setError('That Event Code was not found')
        return false
      }
      saveEventContext(resolved)
      setContext(resolved)
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
    () => ({ context, error, resolving, submitCode, clearError }),
    [context, error, resolving, submitCode, clearError],
  )

  return <EventCodeReactContext.Provider value={api}>{children}</EventCodeReactContext.Provider>
}
