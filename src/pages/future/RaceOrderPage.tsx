import { Navigate } from 'react-router-dom'
import { useEventCode } from '../../hooks/useEventCode'

export function RaceOrderPage() {
  const { context } = useEventCode()
  if (!context) return <Navigate to="/?needCode=1" replace />
  return (
    <section className="panel">
      <h1 className="font-display text-4xl font-extrabold uppercase">Race order</h1>
      <p className="mt-3 text-lg">Coming soon.</p>
    </section>
  )
}
