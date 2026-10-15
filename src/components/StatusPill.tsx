const tones: Record<string, string> = {
  Staging: 'bg-[#f5c518] text-black',
  Active: 'bg-lime-400 text-black',
  Paused: 'bg-[#ff6a00] text-black',
  Finished: 'bg-zinc-600 text-white',
  Cancelled: 'bg-red-600 text-white',
  Waiting: 'bg-zinc-700 text-white',
}

export function StatusPill({ status }: { status: string | null }) {
  const label = status ?? 'Unknown'
  return (
    <span className={`inline-flex min-h-8 items-center px-3 text-sm font-bold uppercase ${tones[label] ?? 'bg-zinc-700 text-white'}`}>
      {label}
    </span>
  )
}
