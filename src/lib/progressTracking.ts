import type { ActiveRaceTiming } from '../types/database'

const STORAGE_KEY = 'eventsync.lapProgress'

export type LapProgressPoint = {
  lap: number
  lapTime: string | null
  place: string | null
}

export type RaceLapProgress = Record<string, LapProgressPoint[]>

type SavedProgress = {
  raceId: number
  laps: RaceLapProgress
}

let cache: { raceId: number; data: RaceLapProgress } | null = null

export function progressKey(classId: number, participantId: number): string {
  return `${classId}:${participantId}`
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

function readRaw(): unknown {
  const local = storage()
  if (!local) return null
  try {
    const raw = local.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

function sanitizeRace(race: unknown): RaceLapProgress {
  if (!race || typeof race !== 'object' || Array.isArray(race)) return {}
  const result: RaceLapProgress = {}
  for (const [key, points] of Object.entries(race)) {
    if (!Array.isArray(points)) continue
    const byLap = new Map<number, LapProgressPoint>()
    for (const point of points) {
      const clean = sanitizePoint(point)
      if (clean) byLap.set(clean.lap, clean)
    }
    result[key] = [...byLap.values()].sort((a, b) => a.lap - b.lap)
  }
  return result
}

function sanitizePoint(point: unknown): LapProgressPoint | null {
  if (!point || typeof point !== 'object') return null
  const lap = Number((point as LapProgressPoint).lap)
  if (!Number.isInteger(lap) || lap < 1) return null
  const lapTime = (point as LapProgressPoint).lapTime
  const place = (point as LapProgressPoint).place
  return {
    lap,
    lapTime: typeof lapTime === 'string' && lapTime.trim() ? lapTime : null,
    place: place == null || place === '' ? null : String(place),
  }
}

function isEnvelope(value: object): value is { raceId: unknown; laps: unknown } {
  return 'raceId' in value && 'laps' in value
}

/** Load chart history for this race. A different stored race is discarded. */
function loadForRace(raceId: number): { laps: RaceLapProgress; replace: boolean } {
  if (cache?.raceId === raceId) return { laps: cache.data, replace: false }

  const parsed = readRaw()
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { laps: {}, replace: false }
  }

  if (isEnvelope(parsed)) {
    const storedRaceId = Number(parsed.raceId)
    if (storedRaceId === raceId) {
      const laps = sanitizeRace(parsed.laps)
      cache = { raceId, data: laps }
      return { laps, replace: false }
    }
    return { laps: {}, replace: true }
  }

  const legacy = sanitizeRaceMap(parsed)
  const current = legacy[String(raceId)]
  if (current) {
    cache = { raceId, data: current }
    return { laps: current, replace: Object.keys(legacy).length !== 1 }
  }
  return { laps: {}, replace: Object.keys(legacy).length > 0 }
}

function sanitizeRaceMap(value: object): Record<string, RaceLapProgress> {
  const map: Record<string, RaceLapProgress> = {}
  for (const [raceId, race] of Object.entries(value)) {
    if (!Number.isInteger(Number(raceId))) continue
    map[raceId] = sanitizeRace(race)
  }
  return map
}

function persist(raceId: number, laps: RaceLapProgress) {
  const saved: SavedProgress = { raceId, laps }
  const local = storage()
  if (local) {
    try {
      local.setItem(STORAGE_KEY, JSON.stringify(saved))
    } catch {
      // Storage can be full or blocked. The in-memory copy still feeds the chart.
    }
  }
  cache = { raceId, data: laps }
}

function placeText(place: unknown): string | null {
  if (place == null || place === '') return null
  return String(place)
}

function isZeroPlace(place: unknown): boolean {
  if (place == null || place === '') return false
  const value = Number(place)
  return Number.isFinite(value) && value === 0
}

/** A restart reports place 0 for the timing rows. Blank places do not count. */
export function isRaceRestart(rows: ActiveRaceTiming[]): boolean {
  if (rows.length === 0) return false
  let sawPlace = false
  for (const row of rows) {
    if (row.place_num == null || row.place_num === '') continue
    if (!isZeroPlace(row.place_num)) return false
    sawPlace = true
  }
  return sawPlace
}

/**
 * Merge the latest timing poll into the local lap history.
 * Each participant keeps one sample per lap: current lap time and place.
 * A later poll for the same lap replaces that sample.
 * History is cleared when a different race is shown, and when places are all 0 (restart).
 */
export function recordLapProgress(raceId: number, rows: ActiveRaceTiming[]): RaceLapProgress {
  const loaded = loadForRace(raceId)
  let laps = loaded.laps
  let dirty = loaded.replace

  if (isRaceRestart(rows)) {
    if (Object.keys(laps).length > 0) {
      laps = {}
      dirty = true
    }
    if (dirty) persist(raceId, laps)
    else cache = { raceId, data: laps }
    return laps
  }

  const draft: RaceLapProgress = { ...laps }
  let changed = false

  for (const row of rows) {
    const lap = row.current_lap_num
    if (lap == null || lap < 1) continue
    if (isZeroPlace(row.place_num)) continue
    const key = progressKey(row.class_id, row.participant_id)
    const points = draft[key] ?? []
    const index = points.findIndex((point) => point.lap === lap)
    const previous = index >= 0 ? points[index] : null
    const lapTime = row.current_lap_time ?? previous?.lapTime ?? null
    const place = placeText(row.place_num) ?? previous?.place ?? null
    if (previous && previous.lapTime === lapTime && previous.place === place) continue
    const nextPoints = points.slice()
    const sample: LapProgressPoint = { lap, lapTime, place }
    if (index >= 0) nextPoints[index] = sample
    else nextPoints.push(sample)
    nextPoints.sort((a, b) => a.lap - b.lap)
    draft[key] = nextPoints
    changed = true
  }

  if (!changed && !dirty) {
    cache = { raceId, data: laps }
    return laps
  }
  const next = changed ? draft : laps
  persist(raceId, next)
  return next
}
