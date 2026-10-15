import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useEventCode } from '../hooks/useEventCode'

const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/live', label: 'Races In Progress', end: false },
  { to: '/results', label: 'Completed Races', end: false },
  { to: '/stream', label: 'Live Stream', end: false },
]

export function Header() {
  const { context } = useEventCode()
  const location = useLocation()
  const [menuPath, setMenuPath] = useState<string | null>(null)
  const open = menuPath === location.pathname

  const contextLabel = context ? `${context.organizationName} · ${context.eventName}` : 'Enter event code'
  const contextHref = context ? '/#event-code' : '/?needCode=1#event-code'

  return (
    <header
      className="sticky top-0 z-30 border-b border-white/10 bg-[#111111]/95 backdrop-blur"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
        <NavLink to="/" className="flex min-h-11 shrink-0 items-center gap-2">
          <img src="/rider.svg" alt="" className="h-10 w-14" />
          <span className="font-display text-2xl font-extrabold uppercase tracking-wide">EventSync</span>
        </NavLink>

        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Primary">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `inline-flex min-h-11 items-center px-3 text-sm font-semibold uppercase tracking-wide ${isActive ? 'text-[#f5c518]' : 'text-zinc-300'}`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <NavLink
          to={contextHref}
          className="ml-auto hidden max-w-xs truncate text-right text-sm text-zinc-300 md:block"
        >
          {contextLabel}
        </NavLink>

        <button
          type="button"
          className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center border border-white/15 md:hidden"
          aria-expanded={open}
          aria-controls="site-nav"
          onClick={() => setMenuPath(open ? null : location.pathname)}
        >
          {open ? 'Close' : 'Menu'}
        </button>
      </div>

      {open ? (
        <nav id="site-nav" className="border-t border-white/10 px-4 py-2 md:hidden" aria-label="Primary">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `flex min-h-11 items-center text-base font-semibold uppercase ${isActive ? 'text-[#f5c518]' : ''}`
              }
            >
              {link.label}
            </NavLink>
          ))}
          <NavLink to={contextHref} className="flex min-h-11 items-center text-sm text-zinc-400">
            {contextLabel}
          </NavLink>
        </nav>
      ) : null}
    </header>
  )
}
