import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useEventCode } from '../hooks/useEventCode'
import { useEventCodeQueryParam } from '../hooks/useEventCodeQueryParam'
import { Skeleton } from './Skeleton'

/** Ensures an Event Code is resolved before rendering spectator pages. Honors `?code=`. */
export function RequireEventContext({ children }: { children: ReactNode }) {
  const { context } = useEventCode()
  const { code, applying, failed } = useEventCodeQueryParam()

  if (context) return children

  if (applying) {
    return (
      <div className="space-y-4">
        <p className="text-zinc-400">Opening event…</p>
        <Skeleton rows={3} />
      </div>
    )
  }

  if (failed && code) {
    return <Navigate to={`/?code=${encodeURIComponent(code)}`} replace />
  }

  if (code) {
    return <Navigate to={`/?code=${encodeURIComponent(code)}`} replace />
  }

  return <Navigate to="/?needCode=1" replace />
}
