import { toDataURL } from 'qrcode'
import { useEffect, useState } from 'react'

export function QrCode({ value }: { value: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    toDataURL(value, {
      margin: 1,
      width: 280,
      color: { dark: '#111111', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setSrc(url)
      })
      .catch(() => {
        if (!cancelled) setError('Could not build the QR code.')
      })
    return () => {
      cancelled = true
    }
  }, [value])

  if (error) return <p className="text-red-400">{error}</p>
  if (!src) return <div className="h-[280px] w-[280px] animate-pulse bg-white/10" aria-label="Loading QR code" />
  return <img src={src} alt={`QR code linking to ${value}`} width={280} height={280} className="bg-white p-2" />
}
