import { useEffect, useSyncExternalStore } from 'react'
import { useEventCode } from './useEventCode'
import { useLiveTiming, useRaceInProgress } from './useRaceInProgress'
import {
  getLapProgressForRace,
  recordLapProgress,
  subscribeLapProgress,
  type RaceLapProgress,
} from '../lib/progressTracking'

const EMPTY_PROGRESS: RaceLapProgress = {}

/**
 * Keeps lap progress recording alive for the selected event on every route.
 * Polls active_race_timing whenever race_in_progress has a live (or finished) race.
 */
export function LapProgressRecorder() {
  const { context } = useEventCode()
  const eventId = context?.eventId ?? null
  const raceQuery = useRaceInProgress(eventId)
  const timingQuery = useLiveTiming(raceQuery.data)
  const raceId = raceQuery.data?.race_id ?? null
  const timingRows = timingQuery.data

  useEffect(() => {
    if (raceId == null || timingRows == null) return
    recordLapProgress(raceId, timingRows)
  }, [raceId, timingRows])

  return null
}

/** Reactive lap history for the chart (updates when the recorder writes). */
export function useLapProgress(raceId: number | null): RaceLapProgress {
  return useSyncExternalStore(
    subscribeLapProgress,
    () => (raceId == null ? EMPTY_PROGRESS : getLapProgressForRace(raceId)),
    () => EMPTY_PROGRESS,
  )
}
