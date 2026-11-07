import { useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useSimulationOptional } from '../lib/simulationContext'

const links = [
  { to: '/order', label: 'Race Order', title: 'View race order for this event', end: false },
  { to: '/live', label: 'Active Race', title: 'View live race timing', end: false },
  { to: '/results', label: 'Results', title: 'View completed race results', end: false },
  { to: '/stream', label: 'Live Stream', title: 'View live stream (coming soon)', end: false },
]

/** Hold duration to open simulation (touch / pointer analogue to Ctrl+click). */
const SIM_LONG_PRESS_MS = 1800

export function Header() {
  const location = useLocation()
  const simulation = useSimulationOptional()
  const [menuPath, setMenuPath] = useState<string | null>(null)
  const open = menuPath === location.pathname
  const longPressTimer = useRef<number | null>(null)
  const suppressBrandClick = useRef(false)

  function clearLongPress() {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  function openSimulationFromBrand(event: { preventDefault: () => void; stopPropagation: () => void }) {
    if (!simulation) return
    event.preventDefault()
    event.stopPropagation()
    suppressBrandClick.current = true
    clearLongPress()
    simulation.openDialog()
  }

  return (
    <header
      className="sticky top-0 z-30 border-b border-white/10 bg-[#111111]/95 backdrop-blur"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
        <NavLink
          to="/"
          className="flex min-h-11 shrink-0 touch-manipulation items-center gap-2 select-none"
          title="Go to Home (Ctrl+click or long-press on Active Race for simulation)"
          onClick={(event) => {
            if (suppressBrandClick.current) {
              event.preventDefault()
              event.stopPropagation()
              suppressBrandClick.current = false
              return
            }
            if (!event.ctrlKey || !simulation) return
            openSimulationFromBrand(event)
          }}
          onPointerDown={(event) => {
            if (!simulation || event.button !== 0) return
            clearLongPress()
            longPressTimer.current = window.setTimeout(() => {
              longPressTimer.current = null
              suppressBrandClick.current = true
              simulation.openDialog()
            }, SIM_LONG_PRESS_MS)
          }}
          onPointerUp={clearLongPress}
          onPointerLeave={clearLongPress}
          onPointerCancel={clearLongPress}
          onContextMenu={(event) => {
            // Avoid the native callout stealing a long-press meant for simulation.
            if (simulation) event.preventDefault()
          }}
        >
          <img src="/rider.svg" alt="" className="h-10 w-14" draggable={false} />
          <span className="font-display text-2xl font-extrabold uppercase tracking-wide">EventSync</span>
        </NavLink>

        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Primary">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              title={link.title}
              className={({ isActive }) =>
                `inline-flex min-h-11 items-center px-3 text-sm font-semibold uppercase tracking-wide ${
                  isActive
                    ? 'bg-[#f5c518]/20 text-[#f5c518]'
                    : 'text-zinc-300 hover:bg-white/5'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center border border-white/15 text-zinc-200 md:hidden"
          aria-expanded={open}
          aria-controls="site-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
          title={open ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuPath(open ? null : location.pathname)}
        >
          {open ? (
            <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
              <path
                fill="currentColor"
                d="M6.4 5.3 5.3 6.4 10.9 12l-5.6 5.6 1.1 1.1L12 13.1l5.6 5.6 1.1-1.1L13.1 12l5.6-5.6-1.1-1.1L12 10.9 6.4 5.3Z"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
              <path
                fill="currentColor"
                d="M4 6.5h16v1.75H4V6.5Zm0 4.625h16v1.75H4v-1.75Zm0 4.625h16V17.5H4v-1.75Z"
              />
            </svg>
          )}
        </button>
      </div>

      {open ? (
        <nav id="site-nav" className="border-t border-white/10 px-4 py-2 md:hidden" aria-label="Primary">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              title={link.title}
              className={({ isActive }) =>
                `flex min-h-11 items-center px-3 text-base font-semibold uppercase ${
                  isActive ? 'bg-[#f5c518]/20 text-[#f5c518]' : ''
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      ) : null}
    </header>
  )
}
