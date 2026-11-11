import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useBlocker, useLocation } from 'react-router-dom'
import { useEventCode } from '../hooks/useEventCode'
import { useEventRaceOrder } from '../hooks/useEventRaceOrder'
import {
  MAX_SIMULATION_LAPS,
  SIMULATE_LAP_SEC,
  SIMULATE_LAPS,
  SIMULATE_SECS,
  selectDemoRaces,
  type RaceOrderOverlay,
} from '../lib/demoSimulation'
import {
  createRaceSimulation,
  loadRaceSimulationParticipants,
  type RaceSimulation,
} from '../lib/raceSimulation'
import { SimulationReactContext, type SimulationApi } from '../lib/simulationContext'
import type { ActiveRaceTiming, EventRaceOrderRow, RaceInProgress, RaceStatus } from '../types/database'
import { SimulationDialog } from './SimulationDialog'
import { SimulationLeaveDialog } from './SimulationLeaveDialog'

const TICK_MS = 250
const LIVE_PATH = '/live'

type SimPhase = 'staging' | 'active' | 'finished'

export function SimulationProvider({ children }: { children: ReactNode }) {
  const { context } = useEventCode()
  const location = useLocation()
  const demoMode = Boolean(context?.demo)
  const eventIdForOrder = context?.eventId ?? null
  const racesQuery = useEventRaceOrder(demoMode ? eventIdForOrder : null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isActive, setIsActive] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const [eventId, setEventId] = useState<number | null>(null)
  const [raceInProgress, setRaceInProgress] = useState<RaceInProgress | null>(null)
  const [timingRows, setTimingRows] = useState<ActiveRaceTiming[]>([])
  const [raceOrderOverlay, setRaceOrderOverlay] = useState<RaceOrderOverlay | null>(null)

  const simRef = useRef<RaceSimulation | null>(null)
  const isActiveRef = useRef(false)
  const isDemoModeRef = useRef(false)
  const demoRacesRef = useRef<EventRaceOrderRow[]>([])
  const demoIndexRef = useRef(0)
  const completedDemoIdsRef = useRef<number[]>([])
  const manualRaceRef = useRef<EventRaceOrderRow | null>(null)
  const manualBaseLapSecRef = useRef(SIMULATE_LAP_SEC)
  const phaseRef = useRef<SimPhase>('staging')
  const phaseStartedAtRef = useRef(0)
  const phaseElapsedOffsetRef = useRef(0)
  const advancingRef = useRef(false)
  const demoBootstrappedForRef = useRef<number | null>(null)
  const contextRef = useRef(context)
  contextRef.current = context

  const applySnapshot = useCallback((snapshot: { race: RaceInProgress; timingRows: ActiveRaceTiming[] }) => {
    setRaceInProgress(snapshot.race)
    setTimingRows(snapshot.timingRows)
  }, [])

  const publishOverlay = useCallback((activeRaceId: number | null, status: RaceStatus | null) => {
    setRaceOrderOverlay({
      simRaceIds: demoRacesRef.current.map((race) => race.race_id),
      activeRaceId,
      status,
      completedRaceIds: [...completedDemoIdsRef.current],
    })
  }, [])

  const clearOverlay = useCallback(() => {
    setRaceOrderOverlay(null)
  }, [])

  const stop = useCallback(() => {
    simRef.current = null
    isActiveRef.current = false
    isDemoModeRef.current = false
    advancingRef.current = false
    demoRacesRef.current = []
    demoIndexRef.current = 0
    completedDemoIdsRef.current = []
    manualRaceRef.current = null
    phaseRef.current = 'staging'
    phaseElapsedOffsetRef.current = 0
    setIsActive(false)
    setIsPaused(false)
    setIsDemoMode(false)
    setEventId(null)
    setRaceInProgress(null)
    setTimingRows([])
    setStarting(false)
    setError(null)
    clearOverlay()
  }, [clearOverlay])

  const pause = useCallback(() => {
    const sim = simRef.current
    if (!sim || sim.isPaused()) return
    const now = Date.now()
    if (phaseRef.current === 'staging' || phaseRef.current === 'finished') {
      phaseElapsedOffsetRef.current += (now - phaseStartedAtRef.current) / 1000
    }
    const snapshot = sim.pause(now)
    applySnapshot(snapshot)
    if (isDemoModeRef.current) {
      publishOverlay(snapshot.race.race_id, sim.getStatus())
    }
    setIsPaused(true)
  }, [applySnapshot, publishOverlay])

  const resume = useCallback(() => {
    const sim = simRef.current
    if (!sim || !sim.isPaused()) return
    const now = Date.now()
    if (phaseRef.current === 'staging' || phaseRef.current === 'finished') {
      phaseStartedAtRef.current = now
    }
    const snapshot = sim.resume(now)
    applySnapshot(snapshot)
    if (isDemoModeRef.current) {
      publishOverlay(snapshot.race.race_id, sim.getStatus())
    }
    setIsPaused(false)
  }, [applySnapshot, publishOverlay])

  const startRaceEngine = useCallback(
    async (
      race: EventRaceOrderRow,
      opts: {
        baseLapSec: number
        maxLaps: number
        demo: boolean
      },
    ): Promise<boolean> => {
      const ctx = contextRef.current
      if (!ctx) {
        setError('Enter an event code first.')
        return false
      }
      const participants = await loadRaceSimulationParticipants(race.race_id, ctx.eventId)
      if (participants.length === 0) {
        setError(`No participants found for race ${race.race_num}.`)
        return false
      }
      const startedAtMs = Date.now()
      const sim = createRaceSimulation({
        context: ctx,
        race,
        participants,
        baseLapSec: opts.baseLapSec,
        startedAtMs,
        maxLaps: opts.maxLaps,
        initialStatus: 'Staging',
      })
      simRef.current = sim
      phaseRef.current = 'staging'
      phaseStartedAtRef.current = startedAtMs
      phaseElapsedOffsetRef.current = 0
      applySnapshot(sim.getSnapshot())
      setEventId(ctx.eventId)
      setIsPaused(false)
      isActiveRef.current = true
      setIsActive(true)
      isDemoModeRef.current = opts.demo
      setIsDemoMode(opts.demo)
      if (opts.demo) {
        publishOverlay(race.race_id, 'Staging')
      } else {
        manualRaceRef.current = race
        manualBaseLapSecRef.current = opts.baseLapSec
        clearOverlay()
      }
      return true
    },
    [applySnapshot, clearOverlay, publishOverlay],
  )

  const restartManualRace = useCallback(async () => {
    if (advancingRef.current || isDemoModeRef.current) return
    const race = manualRaceRef.current
    if (!race) return
    advancingRef.current = true
    setStarting(true)
    setError(null)
    try {
      const ok = await startRaceEngine(race, {
        baseLapSec: manualBaseLapSecRef.current,
        maxLaps: MAX_SIMULATION_LAPS,
        demo: false,
      })
      if (!ok) stop()
    } finally {
      setStarting(false)
      advancingRef.current = false
    }
  }, [startRaceEngine, stop])

  const advanceDemoRace = useCallback(async () => {
    if (advancingRef.current) return
    const ctx = contextRef.current
    if (!ctx?.demo) return
    const races = demoRacesRef.current
    if (races.length === 0) return

    advancingRef.current = true
    try {
      const current = races[demoIndexRef.current]
      if (current && !completedDemoIdsRef.current.includes(current.race_id)) {
        completedDemoIdsRef.current = [...completedDemoIdsRef.current, current.race_id]
      }

      let nextIndex = demoIndexRef.current + 1
      if (nextIndex >= races.length) {
        nextIndex = 0
        completedDemoIdsRef.current = []
      }
      demoIndexRef.current = nextIndex
      const nextRace = races[nextIndex]
      if (!nextRace) return

      setStarting(true)
      setError(null)
      const ok = await startRaceEngine(nextRace, {
        baseLapSec: SIMULATE_LAP_SEC,
        maxLaps: SIMULATE_LAPS,
        demo: true,
      })
      if (!ok) {
        const tried = new Set<number>([nextRace.race_id])
        let found = false
        for (let i = 0; i < races.length; i += 1) {
          const idx = (nextIndex + 1 + i) % races.length
          const candidate = races[idx]
          if (!candidate || tried.has(candidate.race_id)) continue
          tried.add(candidate.race_id)
          demoIndexRef.current = idx
          const retry = await startRaceEngine(candidate, {
            baseLapSec: SIMULATE_LAP_SEC,
            maxLaps: SIMULATE_LAPS,
            demo: true,
          })
          if (retry) {
            found = true
            break
          }
        }
        if (!found) stop()
      }
    } finally {
      setStarting(false)
      advancingRef.current = false
    }
  }, [startRaceEngine, stop])

  const startDemoLoop = useCallback(
    async (races: EventRaceOrderRow[]) => {
      const selected = selectDemoRaces(races)
      if (selected.length === 0) {
        setError('No competitive races available to simulate.')
        return
      }
      demoRacesRef.current = selected
      demoIndexRef.current = 0
      completedDemoIdsRef.current = []
      setStarting(true)
      setError(null)
      try {
        let started = false
        for (let i = 0; i < selected.length; i += 1) {
          const race = selected[i]!
          demoIndexRef.current = i
          const ok = await startRaceEngine(race, {
            baseLapSec: SIMULATE_LAP_SEC,
            maxLaps: SIMULATE_LAPS,
            demo: true,
          })
          if (ok) {
            started = true
            break
          }
        }
        if (!started) {
          setError('No participants found for demo races.')
          stop()
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not start demo simulation.')
        stop()
      } finally {
        setStarting(false)
      }
    },
    [startRaceEngine, stop],
  )

  // Shared Staging → Active → Finished phase machine (demo multi-race or manual single-race loop).
  useEffect(() => {
    if (!isActive || isPaused) return
    const id = window.setInterval(() => {
      const sim = simRef.current
      if (!sim || sim.isPaused()) return
      const now = Date.now()
      const phase = phaseRef.current
      const demo = isDemoModeRef.current

      if (phase === 'staging') {
        const held = phaseElapsedOffsetRef.current + (now - phaseStartedAtRef.current) / 1000
        if (held >= SIMULATE_SECS) {
          phaseRef.current = 'active'
          phaseStartedAtRef.current = now
          phaseElapsedOffsetRef.current = 0
          const snapshot = sim.beginActive(now)
          applySnapshot(snapshot)
          if (demo) publishOverlay(snapshot.race.race_id, 'Active')
        }
        return
      }

      if (phase === 'active') {
        const snapshot = sim.tick(now)
        applySnapshot(snapshot)
        if (demo) publishOverlay(snapshot.race.race_id, snapshot.race.status)
        if (sim.allLapsComplete()) {
          const finished = sim.finish(now)
          applySnapshot(finished)
          phaseRef.current = 'finished'
          phaseStartedAtRef.current = now
          phaseElapsedOffsetRef.current = 0
          if (demo) publishOverlay(finished.race.race_id, 'Finished')
        }
        return
      }

      if (phase === 'finished') {
        const held = phaseElapsedOffsetRef.current + (now - phaseStartedAtRef.current) / 1000
        if (held >= SIMULATE_SECS) {
          if (demo) void advanceDemoRace()
          else void restartManualRace()
        }
      }
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [isActive, isPaused, applySnapshot, publishOverlay, advanceDemoRace, restartManualRace])

  // Auto-start demo when context.demo and races are ready (once per event).
  useEffect(() => {
    if (!demoMode || !context) {
      if (isDemoModeRef.current) stop()
      demoBootstrappedForRef.current = null
      return
    }
    if (isActiveRef.current && isDemoModeRef.current && eventId === context.eventId) {
      demoBootstrappedForRef.current = context.eventId
      return
    }
    if (demoBootstrappedForRef.current === context.eventId) return
    if (racesQuery.isLoading || racesQuery.isError) return
    const races = racesQuery.data
    if (!races) return
    demoBootstrappedForRef.current = context.eventId
    void startDemoLoop(races)
  }, [
    demoMode,
    context,
    context?.eventId,
    racesQuery.data,
    racesQuery.isLoading,
    racesQuery.isError,
    eventId,
    startDemoLoop,
    stop,
  ])

  // Drop simulation if the user switches events / clears code.
  useEffect(() => {
    if (!isActive || eventId == null) return
    if (context?.eventId !== eventId) stop()
  }, [context?.eventId, eventId, isActive, stop])

  // Leave /live cancels only manual sims — demo continues in the background.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (!isActiveRef.current || isDemoModeRef.current) return false
    if (currentLocation.pathname !== LIVE_PATH) return false
    return nextLocation.pathname !== LIVE_PATH
  })

  const openDialog = useCallback(() => {
    if (contextRef.current?.demo) return
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
      if (contextRef.current?.demo) {
        setError('Demo events run simulation automatically.')
        return false
      }
      if (!contextRef.current) {
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
        const ok = await startRaceEngine(race, {
          baseLapSec,
          maxLaps: MAX_SIMULATION_LAPS,
          demo: false,
        })
        if (ok) setDialogOpen(false)
        return ok
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not start simulation.')
        return false
      } finally {
        setStarting(false)
      }
    },
    [location.pathname, startRaceEngine],
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
      isDemoMode,
      eventId,
      raceInProgress,
      timingRows,
      raceOrderOverlay,
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
      isDemoMode,
      eventId,
      raceInProgress,
      timingRows,
      raceOrderOverlay,
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
      {dialogOpen && !demoMode ? <SimulationDialog /> : null}
      {blocker.state === 'blocked' ? (
        <SimulationLeaveDialog onOk={confirmLeave} onCancel={cancelLeave} />
      ) : null}
    </SimulationReactContext.Provider>
  )
}
