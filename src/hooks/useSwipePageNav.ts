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
const MIN_SWIPE_DX = 110
/** Vertical motion may not exceed this share of |dx|. */
const MAX_DY_RATIO = 0.45
/**
 * Over a horizontally scrollable region, only treat the gesture as page nav when
 * average speed meets this (px/ms). Slow drags stay as content scroll.
 */
const MIN_PAGE_SWIPE_VELOCITY = 0.7

function pageIndex(pathname: string): number {
  return SWIPE_NAV_PAGES.findIndex((path) => path === pathname)
}

function findHorizScrollParent(el: Element | null): HTMLElement | null {
  let node: Element | null = el
  while (node && node !== document.body) {
    if (node instanceof HTMLElement) {
      const style = window.getComputedStyle(node)
      const overflowX = style.overflowX
      if (
        (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay') &&
        node.scrollWidth > node.clientWidth + 1
      ) {
        return node
      }
    }
    node = node.parentElement
  }
  return null
}

function navigateStateFor(path: (typeof SWIPE_NAV_PAGES)[number]) {
  // Race Order auto-opens the next-race toast on visit; skip that for swipe arrivals.
  if (path === '/order') return { skipProgressPopup: true }
  return undefined
}

/**
 * Mobile: swipe right → previous page, swipe left → next page.
 * Requires a clear horizontal gesture; does not wrap at ends.
 * Popups/dialogs do not block page swipes.
 *
 * Over horizontal scrollers: page nav only on a fast flick (velocity threshold).
 */
export function useSwipePageNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const startRef = useRef<{
    x: number
    y: number
    t: number
    target: EventTarget | null
  } | null>(null)
  /** Swallow the synthetic click that follows a swipe ending on a <Link>/button (e.g. Home → Race Order). */
  const suppressClickRef = useRef(false)
  const pathRef = useRef(location.pathname)
  pathRef.current = location.pathname

  useEffect(() => {
    function go(path: (typeof SWIPE_NAV_PAGES)[number]) {
      suppressClickRef.current = true
      navigate(path, { state: navigateStateFor(path) })
    }

    function onTouchStart(event: TouchEvent) {
      if (event.touches.length !== 1) {
        startRef.current = null
        return
      }
      const touch = event.touches[0]
      if (!touch) return
      startRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        t: performance.now(),
        target: event.target,
      }
    }

    function onTouchMove(event: TouchEvent) {
      if (startRef.current == null) return
      // Cancel if a second finger lands mid-gesture.
      if (event.touches.length > 1) {
        startRef.current = null
      }
    }

    function onTouchEnd(event: TouchEvent) {
      const start = startRef.current
      startRef.current = null
      if (start == null) return

      const touch = event.changedTouches[0]
      if (!touch) return
      const dx = touch.clientX - start.x
      const dy = touch.clientY - start.y
      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)
      if (absDx < MIN_SWIPE_DX) return
      if (absDy > absDx * MAX_DY_RATIO) return

      const scroller = findHorizScrollParent(
        start.target instanceof Element ? start.target : null,
      )
      if (scroller != null) {
        const elapsed = Math.max(performance.now() - start.t, 1)
        const velocity = absDx / elapsed
        if (velocity < MIN_PAGE_SWIPE_VELOCITY) return
      }

      const index = pageIndex(pathRef.current)
      if (index < 0) return

      if (dx > 0) {
        // Swipe toward right → previous page
        if (index <= 0) return
        go(SWIPE_NAV_PAGES[index - 1]!)
        return
      }
      // Swipe toward left → next page
      if (index >= SWIPE_NAV_PAGES.length - 1) return
      go(SWIPE_NAV_PAGES[index + 1]!)
    }

    function onTouchCancel() {
      startRef.current = null
    }

    function onClickCapture(event: MouseEvent) {
      if (!suppressClickRef.current) return
      suppressClickRef.current = false
      event.preventDefault()
      event.stopPropagation()
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    document.addEventListener('touchcancel', onTouchCancel, { passive: true })
    document.addEventListener('click', onClickCapture, true)
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('touchcancel', onTouchCancel)
      document.removeEventListener('click', onClickCapture, true)
    }
  }, [navigate])
}
