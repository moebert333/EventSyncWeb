import { createContext, useContext } from 'react'
import type { ActiveRaceTiming, EventRaceOrderRow, RaceInProgress } from '../types/database'

export type SimulationApi = {
  dialogOpen: boolean
  openDialog: () => void
  closeDialog: () => void
  isActive: boolean
  isPaused: boolean
  eventId: number | null
  raceInProgress: RaceInProgress | null
  timingRows: ActiveRaceTiming[]
  starting: boolean
  error: string | null
  start: (race: EventRaceOrderRow, baseLapSec: number) => Promise<boolean>
  pause: () => void
  resume: () => void
  stop: () => void
}

export const SimulationReactContext = createContext<SimulationApi | null>(null)

export function useSimulation(): SimulationApi {
  const value = useContext(SimulationReactContext)
  if (!value) throw new Error('useSimulation must be used within SimulationProvider')
  return value
}

/** For hooks that may run outside the provider in tests; returns null if absent. */
export function useSimulationOptional(): SimulationApi | null {
  return useContext(SimulationReactContext)
}
