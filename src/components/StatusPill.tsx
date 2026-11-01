import { useEffect, useRef, useState } from 'react'

export const statusToneClass: Record<string, string> = {
  Waiting: 'bg-zinc-300 text-black',
  Staging: 'bg-orange-300 text-black',
  Active: 'bg-green-500 text-black',
  Paused: 'bg-yellow-300 text-black',
  Finished: 'bg-sky-300 text-black',
  Cancelled: 'bg-red-600 text-white',
}

export function StatusPill({ status }: { status: string | null }) {
  const label = status ?? 'Unknown'
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="relative inline-flex" ref={rootRef}>
      <button
        type="button"
        className={`inline-flex min-h-8 cursor-pointer items-center px-3 text-sm font-bold uppercase ${
          statusToneClass[label] ?? 'bg-zinc-300 text-black'
        }`}
        aria-expanded={open}
        aria-haspopup="true"
        title={`Show race status: ${label}`}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </button>
      {open ? (
        <p
          role="status"
          className="absolute left-0 top-full z-20 mt-1 whitespace-nowrap border border-white/20 bg-[#1a1a1a] px-3 py-2 text-sm text-white shadow-lg"
        >
          Race status: {label}
        </p>
      ) : null}
    </div>
  )
}
