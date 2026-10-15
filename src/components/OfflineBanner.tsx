import { useOnline } from '../hooks/useOnline'

export function OfflineBanner() {
  const online = useOnline()
  if (online) return null
  return (
    <div className="bg-[#ff6a00] px-4 py-2 text-center text-sm font-semibold text-black" role="status">
      You’re offline. Live times need a connection.
    </div>
  )
}
