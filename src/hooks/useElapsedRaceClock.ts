import { useEffect, useRef, useState } from 'react'
import { formatElapsedRaceTime, formatElapsedSeconds, raceTimeSeconds } from '../lib/format'

/**
 * Displays server elapsed race time, advancing locally every second while `running`
 * so the clock stays smooth between slower race_in_progress polls.
 */
export function useElapsedRaceClock(
  elapsedRaceTime: string | null | undefined,
  running: boolean,
): string {
  const [display, setDisplay] = useState(() => formatElapsedRaceTime(elapsedRaceTime))
  const base = useRef({ serverSeconds: -1, syncedAt: 0 })

  useEffect(() => {
    if (elapsedRaceTime == null || elapsedRaceTime === '') {
      base.current = { serverSeconds: -1, syncedAt: 0 }
      setDisplay('—')
      return
    }
    const parsed = raceTimeSeconds(elapsedRaceTime)
    if (parsed == null) {
      base.current = { serverSeconds: -1, syncedAt: 0 }
      setDisplay(formatElapsedRaceTime(elapsedRaceTime))
      return
    }
    const serverSeconds = Math.floor(parsed)
    if (serverSeconds !== base.current.serverSeconds) {
      base.current = { serverSeconds, syncedAt: Date.now() }
      setDisplay(formatElapsedSeconds(serverSeconds))
      return
    }
    if (!running) {
      setDisplay(formatElapsedSeconds(serverSeconds))
    }
  }, [elapsedRaceTime, running])

  useEffect(() => {
    if (!running) return
    const tick = () => {
      const { serverSeconds, syncedAt } = base.current
      if (serverSeconds < 0) return
      const elapsed = serverSeconds + Math.floor((Date.now() - syncedAt) / 1000)
      setDisplay(formatElapsedSeconds(elapsed))
    }
    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [running])

  return display
}
