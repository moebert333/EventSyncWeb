import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function AdminFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#111111] text-white">
      <header
        className="border-b border-white/10"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link to="/" className="flex min-h-11 items-center gap-2">
            <img src="/rider.svg" alt="" className="h-9 w-12" />
            <span className="font-display text-2xl font-extrabold uppercase">EventSync</span>
          </Link>
          <span className="text-sm uppercase tracking-wide text-zinc-500">Organization admin</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  )
}
