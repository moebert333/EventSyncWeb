import type { ActiveRaceTiming } from '../types/database'

export type LapProgressPoint = {
  lap: number
  lapTime: string | null
  place: string | null
  bestLapTime: string | null
  leaderGap: string | null
  nextGap: string | null
}

export function progressKey(classId: number, participantId: number): string {
  return `${classId}:${participantId}`
}

function isZeroPlace(place: unknown): boolean {
  if (place == null || place === '') return false
  const value = Number(place)
  return Number.isFinite(value) && value === 0
}

/**
 * One row per (class, participant): the highest `current_lap_num`.
 * `active_race_timing` returns every recorded lap; the live table shows only the latest.
 */
export function latestTimingRows(rows: ActiveRaceTiming[]): ActiveRaceTiming[] {
  const best = new Map<string, ActiveRaceTiming>()
  for (const row of rows) {
    const key = progressKey(row.class_id, row.participant_id)
    const prev = best.get(key)
    if (!prev || (row.current_lap_num ?? -1) > (prev.current_lap_num ?? -1)) {
      best.set(key, row)
    }
  }
  return [...best.values()]
}

/** Chart series for one rider from all lap rows in `active_race_timing`. */
export function lapPointsForParticipant(
  rows: ActiveRaceTiming[],
  classId: number,
  participantId: number,
): LapProgressPoint[] {
  const byLap = new Map<number, LapProgressPoint>()
  for (const row of rows) {
    if (row.class_id !== classId || row.participant_id !== participantId) continue
    const lap = row.current_lap_num
    if (lap == null || lap < 1) continue
    if (isZeroPlace(row.place_num)) continue
    byLap.set(lap, {
      lap,
      lapTime: row.current_lap_time,
      place: row.place_num == null || row.place_num === '' ? null : String(row.place_num),
      bestLapTime: row.best_lap_time,
      leaderGap: row.leader_gap_time,
      nextGap: row.next_gap_time,
    })
  }
  return [...byLap.values()].sort((a, b) => a.lap - b.lap)
}
