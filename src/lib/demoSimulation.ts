import type { EventRaceOrderRow, RaceStatus } from '../types/database'

/** Hold time (seconds) for Staging and Finished phases. */
export const SIMULATE_SECS = 5
/** Laps each rider must complete before the race moves to Finished (demo loop). */
export const SIMULATE_LAPS = 8
/** Laps each rider must complete before Finished (manual Active Race simulation). */
export const MAX_SIMULATION_LAPS = SIMULATE_LAPS
/** Base lap duration (seconds) for the existing lap engine. */
export const SIMULATE_LAP_SEC = 5

export type RaceOrderOverlay = {
  /** Competitive races included in the current demo loop. */
  simRaceIds: number[]
  /** Race currently being simulated. */
  activeRaceId: number | null
  /** Status of the active simulated race. */
  status: RaceStatus | null
  /** Races in the sim set that have finished during this loop. */
  completedRaceIds: number[]
}

/**
 * Prefer competitive races 5–10; if none, use 1–5; otherwise all competitive races.
 */
export function selectDemoRaces(races: EventRaceOrderRow[]): EventRaceOrderRow[] {
  const competitive = races
    .filter((race) => !race.is_practice)
    .slice()
    .sort((a, b) => a.race_num - b.race_num)
  if (competitive.length === 0) return []

  const in5to10 = competitive.filter((race) => race.race_num >= 5 && race.race_num <= 10)
  if (in5to10.length > 0) return in5to10

  const in1to5 = competitive.filter((race) => race.race_num >= 1 && race.race_num <= 5)
  if (in1to5.length > 0) return in1to5

  return competitive
}

/** Apply local demo active/completed/status over DB race-order rows. */
export function applyRaceOrderOverlay(
  races: EventRaceOrderRow[],
  overlay: RaceOrderOverlay,
): EventRaceOrderRow[] {
  const simIds = new Set(overlay.simRaceIds)
  const completed = new Set(overlay.completedRaceIds)
  const minSimNum = Math.min(
    ...races.filter((race) => simIds.has(race.race_id)).map((race) => race.race_num),
  )

  return races.map((race) => {
    if (!simIds.has(race.race_id)) {
      // Races before the sim range keep DB completed; never show as active during demo.
      // Races after the sim range stay incomplete and inactive.
      const beforeRange = Number.isFinite(minSimNum) && race.race_num < minSimNum
      return {
        ...race,
        active: false,
        completed: beforeRange ? race.completed : false,
        status: beforeRange && race.completed ? race.status : null,
      }
    }

    const isActive = overlay.activeRaceId === race.race_id
    const isCompleted = completed.has(race.race_id)
    return {
      ...race,
      active: isActive,
      completed: isCompleted,
      status: isActive ? overlay.status : isCompleted ? ('Finished' as RaceStatus) : null,
    }
  })
}
