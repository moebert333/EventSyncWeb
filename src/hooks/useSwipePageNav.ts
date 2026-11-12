import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/** Public page order (matches nav). No wrap — stop at first/last. */
export const SWIPE_NAV_PAGES = [
  '/',
  '/order',
  '/live',
  '/results',
  '/dashboard',
  '/stream',
] as const

/** Minimum horizontal travel for a definitive swipe (px). */
const MIN_SWIPE_DX = 96
/** Vertical motion may not exceed this share of |dx|. */
const MAX_DY_RATIO = 0.45

function pageIndex(pathname: string): number {
  return SWIPE_NAV_PAGES.findIndex((path) => path === pathname)
}

function isHorizontallyScrollable(el: Element | null): boolean {
  let node: Element | null = el
  while (node && node !== document.body) {
    if (node instanceof HTMLElement) {
      const style = window.getComputedStyle(node)
      const overflowX = style.overflowX
      if (
        (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay') &&
        node.scrollWidth > node.clientWidth + 1
      ) {
        return true
      }
    }
    node = node.parentElement
  }
  return false
}

function dialogOpen(): boolean {
  return document.querySelector('[role="dialog"]') != null
}

/**
 * Mobile: swipe right → previous page, swipe left → next page.
 * Requires a clear horizontal gesture; does not wrap at ends.
 */
export function useSwipePageNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const startRef = useRef<{ x: number; y: number; target: EventTarget | null } | null>(null)
  const pathRef = useRef(location.pathname)
  pathRef.current = location.pathname

  useEffect(() => {
    function onTouchStart(event: TouchEvent) {
      if (event.touches.length !== 1) {
        startRef.current = null
        return
      }
      if (dialogOpen()) {
        startRef.current = null
        return
      }
      const touch = event.touches[0]
      if (!touch) return
      startRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        target: event.target,
      }
    }

    function onTouchMove(event: TouchEvent) {
      if (startRef.current == null || event.touches.length !== 1) return
      // Cancel if a second finger lands mid-gesture.
      if (event.touches.length > 1) {
        startRef.current = null
      }
    }

    function onTouchEnd(event: TouchEvent) {
      const start = startRef.current
      startRef.current = null
      if (start == null) return
      if (dialogOpen()) return
      if (isHorizontallyScrollable(start.target instanceof Element ? start.target : null)) {
        return
      }

      const touch = event.changedTouches[0]
      if (!touch) return
      const dx = touch.clientX - start.x
      const dy = touch.clientY - start.y
      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)
      if (absDx < MIN_SWIPE_DX) return
      if (absDy > absDx * MAX_DY_RATIO) return

      const index = pageIndex(pathRef.current)
      if (index < 0) return

      if (dx > 0) {
        // Swipe toward right → previous page
        if (index <= 0) return
        navigate(SWIPE_NAV_PAGES[index - 1]!)
        return
      }
      // Swipe toward left → next page
      if (index >= SWIPE_NAV_PAGES.length - 1) return
      navigate(SWIPE_NAV_PAGES[index + 1]!)
    }

    function onTouchCancel() {
      startRef.current = null
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    document.addEventListener('touchcancel', onTouchCancel, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('touchcancel', onTouchCancel)
    }
  }, [navigate])
}
