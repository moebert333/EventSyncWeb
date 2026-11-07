import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useBlocker, useLocation } from 'react-router-dom'
import { useEventCode } from '../hooks/useEventCode'
import {
  createRaceSimulation,
  loadRaceSimulationParticipants,
  type RaceSimulation,
} from '../lib/raceSimulation'
import { SimulationReactContext, type SimulationApi } from '../lib/simulationContext'
import type { ActiveRaceTiming, EventRaceOrderRow, RaceInProgress } from '../types/database'
import { SimulationDialog } from './SimulationDialog'
import { SimulationLeaveDialog } from './SimulationLeaveDialog'

const TICK_MS = 250
const LIVE_PATH = '/live'

export function SimulationProvider({ children }: { children: ReactNode }) {
  const { context } = useEventCode()
  const location = useLocation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isActive, setIsActive] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [eventId, setEventId] = useState<number | null>(null)
  const [raceInProgress, setRaceInProgress] = useState<RaceInProgress | null>(null)
  const [timingRows, setTimingRows] = useState<ActiveRaceTiming[]>([])
  const simRef = useRef<RaceSimulation | null>(null)
  const isActiveRef = useRef(false)

  const applySnapshot = useCallback((snapshot: { race: RaceInProgress; timingRows: ActiveRaceTiming[] }) => {
    setRaceInProgress(snapshot.race)
    setTimingRows(snapshot.timingRows)
  }, [])

  const stop = useCallback(() => {
    simRef.current = null
    isActiveRef.current = false
    setIsActive(false)
    setIsPaused(false)
    setEventId(null)
    setRaceInProgress(null)
    setTimingRows([])
    setStarting(false)
    setError(null)
  }, [])

  const pause = useCallback(() => {
    const sim = simRef.current
    if (!sim || sim.isPaused()) return
    applySnapshot(sim.pause(Date.now()))
    setIsPaused(true)
  }, [applySnapshot])

  const resume = useCallback(() => {
    const sim = simRef.current
    if (!sim || !sim.isPaused()) return
    applySnapshot(sim.resume(Date.now()))
    setIsPaused(false)
  }, [applySnapshot])

  useEffect(() => {
    if (!isActive || isPaused) return
    const id = window.setInterval(() => {
      const sim = simRef.current
      if (!sim || sim.isPaused()) return
      applySnapshot(sim.tick(Date.now()))
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [isActive, isPaused, applySnapshot])

  // Drop simulation if the user switches events.
  useEffect(() => {
    if (!isActive || eventId == null) return
    if (context?.eventId !== eventId) stop()
  }, [context?.eventId, eventId, isActive, stop])

  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (!isActiveRef.current) return false
    if (currentLocation.pathname !== LIVE_PATH) return false
    return nextLocation.pathname !== LIVE_PATH
  })

  const openDialog = useCallback(() => {
    setError(null)
    if (location.pathname !== LIVE_PATH && !isActiveRef.current) {
      setError('Go to Active Race to start a simulation.')
      setDialogOpen(true)
      return
    }
    setDialogOpen(true)
  }, [location.pathname])

  const closeDialog = useCallback(() => {
    setDialogOpen(false)
    setError(null)
  }, [])

  const start = useCallback(
    async (race: EventRaceOrderRow, baseLapSec: number): Promise<boolean> => {
      if (!context) {
        setError('Enter an event code first.')
        return false
      }
      if (location.pathname !== LIVE_PATH) {
        setError('Go to Active Race to start a simulation.')
        return false
      }
      setStarting(true)
      setError(null)
      try {
        const participants = await loadRaceSimulationParticipants(race.race_id, context.eventId)
        if (participants.length === 0) {
          setError('No participants found for that race.')
          return false
        }
        const startedAtMs = Date.now()
        const sim = createRaceSimulation({
          context,
          race,
          participants,
          baseLapSec,
          startedAtMs,
        })
        simRef.current = sim
        applySnapshot(sim.tick(startedAtMs))
        setEventId(context.eventId)
        setIsPaused(false)
        isActiveRef.current = true
        setIsActive(true)
        setDialogOpen(false)
        return true
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not start simulation.')
        return false
      } finally {
        setStarting(false)
      }
    },
    [applySnapshot, context, location.pathname],
  )

  function confirmLeave() {
    stop()
    if (blocker.state === 'blocked') blocker.proceed()
  }

  function cancelLeave() {
    if (blocker.state === 'blocked') blocker.reset()
  }

  const api = useMemo<SimulationApi>(
    () => ({
      dialogOpen,
      openDialog,
      closeDialog,
      isActive,
      isPaused,
      eventId,
      raceInProgress,
      timingRows,
      starting,
      error,
      start,
      pause,
      resume,
      stop,
    }),
    [
      dialogOpen,
      openDialog,
      closeDialog,
      isActive,
      isPaused,
      eventId,
      raceInProgress,
      timingRows,
      starting,
      error,
      start,
      pause,
      resume,
      stop,
    ],
  )

  return (
    <SimulationReactContext.Provider value={api}>
      {children}
      {dialogOpen ? <SimulationDialog /> : null}
      {blocker.state === 'blocked' ? (
        <SimulationLeaveDialog onOk={confirmLeave} onCancel={cancelLeave} />
      ) : null}
    </SimulationReactContext.Provider>
  )
}
