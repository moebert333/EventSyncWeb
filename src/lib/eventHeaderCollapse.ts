import { useEffect, useState } from 'react'

/** Persist collapsed Event/Rider row (+ Demo banner) across pages. */
const COLLAPSED_KEY = 'eventsync.eventHeaderCollapsed'

type Listener = () => void

function readStored(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function writeStored(collapsed: boolean) {
  try {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    // ignore
  }
}

let collapsed = readStored()
const listeners = new Set<Listener>()

function notify() {
  for (const listener of listeners) listener()
}

export function getEventHeaderCollapsed(): boolean {
  return collapsed
}

export function setEventHeaderCollapsed(next: boolean) {
  if (collapsed === next) return
  collapsed = next
  writeStored(next)
  notify()
}

export function toggleEventHeaderCollapsed(): boolean {
  setEventHeaderCollapsed(!collapsed)
  return collapsed
}

export function subscribeEventHeaderCollapsed(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Shared collapsed state for Event/Rider strip and Demo simulation banner. */
export function useEventHeaderCollapsed(): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState(getEventHeaderCollapsed)
  useEffect(() => subscribeEventHeaderCollapsed(() => setValue(getEventHeaderCollapsed())), [])
  return [value, setEventHeaderCollapsed]
}
