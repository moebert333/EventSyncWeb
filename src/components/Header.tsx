import { useEffect, useRef, useState } from 'react'
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

/** Ignore hamburger taps briefly after a route change (mobile click-through). */
const MENU_NAV_GUARD_MS = 450

/** Matches Tailwind `gap-3` between brand / nav / hamburger. */
const SECTION_GAP_PX = 12

/** Matches Tailwind `gap-1` between banner menu items. */
const ITEM_GAP_PX = 4

/** Matches Tailwind `min-w-11` hamburger button. */
const HAMBURGER_WIDTH_PX = 44

const bannerLinkClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-11 shrink-0 items-center px-3 text-sm font-semibold uppercase tracking-wide ${
    isActive ? 'bg-[#f5c518]/20 text-[#f5c518]' : 'text-zinc-300 hover:bg-white/5'
  }`

export function Header() {
  const location = useLocation()
  const simulation = useSimulationOptional()
  const [menuPath, setMenuPath] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(links.length)
  const open = menuPath === location.pathname
  const longPressTimer = useRef<number | null>(null)
  const suppressBrandClick = useRef(false)
  const menuNavGuardUntil = useRef(0)
  const rowRef = useRef<HTMLDivElement>(null)
  const brandRef = useRef<HTMLAnchorElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const rafFit = useRef<number | null>(null)

  const overflowLinks = links.slice(visibleCount)
  const needsHamburger = overflowLinks.length > 0

  useEffect(() => {
    setMenuPath(null)
    menuNavGuardUntil.current = Date.now() + MENU_NAV_GUARD_MS
  }, [location.pathname])

  useEffect(() => {
    if (!needsHamburger) setMenuPath(null)
  }, [needsHamburger])

  useEffect(() => {
    const row = rowRef.current
    const brand = brandRef.current
    const measure = measureRef.current
    if (!row || !brand || !measure) return

    function updateVisibleCount() {
      if (!row || !brand || !measure) return
      // Each link is measured twice (inactive + active) so selection highlight
      // cannot change widths enough to flip the fit count.
      const children = Array.from(measure.children) as HTMLElement[]
      if (children.length < links.length * 2) return
      const itemWidths = links.map((_, i) => {
        const inactive = children[i]!
        const active = children[i + links.length]!
        return Math.max(inactive.offsetWidth, active.offsetWidth)
      })
      if (itemWidths.some((width) => width <= 0)) return

      const spaceAfterBrand = row.clientWidth - brand.offsetWidth - SECTION_GAP_PX

      function countFitting(available: number): number {
        let used = 0
        let count = 0
        for (const width of itemWidths) {
          const next = used + (count > 0 ? ITEM_GAP_PX : 0) + width
          if (next > available + 0.5) break
          used = next
          count += 1
        }
        return count
      }

      // Always reserve hamburger width when deciding capacity. Show all (and hide
      // the button) only if every item still fits in that reduced space — avoids
      // scrollbar / subpixel thrash that oscillates hamburger on/off.
      const reserved = spaceAfterBrand - SECTION_GAP_PX - HAMBURGER_WIDTH_PX
      const fitting = countFitting(Math.max(0, reserved))
      const next = fitting >= links.length ? links.length : fitting
      setVisibleCount((prev) => (prev === next ? prev : next))
    }

    function scheduleUpdate() {
      if (rafFit.current != null) return
      rafFit.current = window.requestAnimationFrame(() => {
        rafFit.current = null
        updateVisibleCount()
      })
    }

    const observer = new ResizeObserver(scheduleUpdate)
    observer.observe(row)
    observer.observe(brand)
    updateVisibleCount()
    void document.fonts?.ready.then(updateVisibleCount)

    return () => {
      observer.disconnect()
      if (rafFit.current != null) window.cancelAnimationFrame(rafFit.current)
    }
  }, [])

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
      <div
        ref={rowRef}
        className="relative mx-auto flex max-w-6xl items-center gap-3 px-4 py-2"
      >
        <NavLink
          ref={brandRef}
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
          <span className="font-display text-2xl font-extrabold uppercase tracking-wide">Event Sync</span>
        </NavLink>

        <nav className="flex min-w-0 items-center gap-1" aria-label="Primary">
          {links.slice(0, visibleCount).map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              title={link.title}
              className={bannerLinkClass}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        {/* Off-screen copies used only to measure banner item widths. */}
        <div
          ref={measureRef}
          className="pointer-events-none fixed top-0 -left-[9999px] -z-10 flex items-center gap-1"
          aria-hidden="true"
        >
          {links.map((link) => (
            <span key={`${link.to}-idle`} className={bannerLinkClass({ isActive: false })}>
              {link.label}
            </span>
          ))}
          {links.map((link) => (
            <span key={`${link.to}-active`} className={bannerLinkClass({ isActive: true })}>
              {link.label}
            </span>
          ))}
        </div>

        {needsHamburger ? (
          <button
            type="button"
            className="ml-auto inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center border border-white/15 text-zinc-200"
            aria-expanded={open}
            aria-controls="site-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            title={open ? 'Close menu' : 'Open menu'}
            onClick={() => {
              if (Date.now() < menuNavGuardUntil.current) return
              setMenuPath(open ? null : location.pathname)
            }}
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
        ) : null}
      </div>

      {open && needsHamburger ? (
        <nav id="site-nav" className="border-t border-white/10 px-4 py-2" aria-label="More">
          {overflowLinks.map((link) => (
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
