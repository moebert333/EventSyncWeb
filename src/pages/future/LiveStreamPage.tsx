import { Navigate } from 'react-router-dom'
import { EventParticipantHeader } from '../../components/EventParticipantHeader'
import { useEventCode } from '../../hooks/useEventCode'

export function LiveStreamPage() {
  const { context } = useEventCode()
  if (!context) return <Navigate to="/?needCode=1" replace />

  return (
    <div className="space-y-5">
      <EventParticipantHeader
        eventId={context.eventId}
        eventName={context.eventName}
        pageTitle="Live Stream"
      />
      <section className="panel">
        <h1 className="font-display text-4xl font-extrabold uppercase">Live stream</h1>
        <p className="mt-3 text-lg">Coming soon.</p>
      </section>
    </div>
  )
}
