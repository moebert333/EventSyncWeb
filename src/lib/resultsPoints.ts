import type { EventClassResult } from '../types/database'

export type ScoringKey = 'race1_place' | 'race2_place' | 'race3_place' | 'finals_place'

const MOTO_KEYS: ScoringKey[] = ['race1_place', 'race2_place', 'race3_place']
const NON_NUMERIC_SCORE = 80
const MAX_SCHEMA_MOTOS = 3

export type RaceSessionForMaxMoto = {
  session_name: string | null
  class_ids: number[]
}

/** Parse a place label to a positive integer; DNS/DNF/empty → null. */
export function parsePlaceValue(label: string | number | null | undefined): number | null {
  if (label == null || label === '') return null
  if (typeof label === 'number') {
    return Number.isFinite(label) && label > 0 ? Math.trunc(label) : null
  }
  const trimmed = label.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  return value > 0 ? value : null
}

/** Extract moto number from session names like `DIV::1::MOTO 2`. */
export function parseMotoNumberFromSession(session: string | null | undefined): number | null {
  if (session == null || session.trim() === '') return null
  const match = /MOTO\s*(\d+)/i.exec(session)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) && value > 0 ? value : null
}

/** Largest MOTO n per class from Race Order sessions. */
export function maxMotoByClassId(races: RaceSessionForMaxMoto[]): Map<number, number> {
  const result = new Map<number, number>()
  for (const race of races) {
    const moto = parseMotoNumberFromSession(race.session_name)
    if (moto == null) continue
    for (const classId of race.class_ids) {
      const current = result.get(classId)
      if (current == null || moto > current) result.set(classId, moto)
    }
  }
  return result
}

function hasColumnValue(value: string | number | null | undefined): boolean {
  return value != null && value !== ''
}

function pointsAllEmpty(rows: EventClassResult[]): boolean {
  return rows.every((row) => row.overall_points == null || row.overall_points === 0)
}

function classHasNumericPlace(rows: EventClassResult[]): boolean {
  return rows.some((row) => {
    const place = parsePlaceValue(row.overall_place)
    return place != null && place > 0
  })
}

/** True when the class needs full client Place + Points calculation (no server Place). */
export function classNeedsPointsCalc(rows: EventClassResult[]): boolean {
  if (rows.length === 0) return false
  if (classHasNumericPlace(rows)) return false
  return pointsAllEmpty(rows)
}

/** True when Place exists but Points are all 0/null — fill Points only. */
export function classNeedsPointsOnlyFill(rows: EventClassResult[]): boolean {
  if (rows.length === 0) return false
  return classHasNumericPlace(rows) && pointsAllEmpty(rows)
}

function columnHasAnyValue(rows: EventClassResult[], key: ScoringKey): boolean {
  return rows.some((row) => hasColumnValue(row[key]))
}

function columnHasNumericScore(rows: EventClassResult[], key: ScoringKey): boolean {
  return rows.some((row) => parsePlaceValue(row[key]) != null)
}

export function motoKeysUpTo(maxMoto: number): ScoringKey[] {
  const capped = Math.min(Math.max(1, Math.trunc(maxMoto)), MAX_SCHEMA_MOTOS)
  return MOTO_KEYS.slice(0, capped)
}

/**
 * When max moto is known, use moto columns ≤ max that have class-wide values.
 * Else Final alone when it has values. Never Semi/LCQ.
 */
export function activeScoringKeys(
  rows: EventClassResult[],
  maxMoto: number | null,
): ScoringKey[] {
  if (maxMoto != null && maxMoto >= 1) {
    return motoKeysUpTo(maxMoto).filter((key) => columnHasAnyValue(rows, key))
  }
  const motos = MOTO_KEYS.filter((key) => columnHasAnyValue(rows, key))
  if (motos.length > 0) return motos
  if (columnHasAnyValue(rows, 'finals_place')) return ['finals_place']
  return []
}

/** Every moto 1…maxMoto has at least one numeric place > 0 in the class. */
export function motosFullyScored(rows: EventClassResult[], maxMoto: number): boolean {
  return motoKeysUpTo(maxMoto).every((key) => columnHasNumericScore(rows, key))
}

/** At least one moto 1…maxMoto has a numeric place > 0 in the class. */
export function anyMotoScored(rows: EventClassResult[], maxMoto: number): boolean {
  return motoKeysUpTo(maxMoto).some((key) => columnHasNumericScore(rows, key))
}

/** VITE_REQUIRE_ALL_MOTOS: true/1 only; missing or anything else → false. */
export function requireAllMotosFromEnv(
  value: string | undefined = import.meta.env.VITE_REQUIRE_ALL_MOTOS,
): boolean {
  if (value == null || value.trim() === '') return false
  const normalized = value.trim().toLowerCase()
  return normalized === 'true' || normalized === '1'
}

function scoreForColumn(row: EventClassResult, key: ScoringKey): number {
  const parsed = parsePlaceValue(row[key])
  return parsed ?? NON_NUMERIC_SCORE
}

function riderHasAnyNumericScore(row: EventClassResult, keys: ScoringKey[]): boolean {
  return keys.some((key) => parsePlaceValue(row[key]) != null)
}

type RankedRider = {
  row: EventClassResult
  sum: number
  lastScore: number
  allNonNumeric: boolean
}

/**
 * When gates pass, fill overall_place (if missing) and overall_points when the
 * moto Points gate passes (VITE_REQUIRE_ALL_MOTOS) or Final path. Incomplete → Points 0.
 * When server Place exists and Points are empty, keep Place and fill Points only.
 */
function withZeroPoints(rows: EventClassResult[]): EventClassResult[] {
  if (rows.every((row) => row.overall_points === 0)) return rows
  return rows.map((row) => ({
    ...row,
    overall_points: row.overall_points ?? 0,
  }))
}

function shouldAssignPointsForClass(
  rows: EventClassResult[],
  keys: ScoringKey[],
  maxMoto: number | null,
): boolean {
  const isFinalPath = keys.length === 1 && keys[0] === 'finals_place'
  // With a scheduled max moto: VITE_REQUIRE_ALL_MOTOS=true → every moto 1…max;
  // false (default) → Points once any one moto is numerically scored.
  // Final-only or unknown max moto: assign Points as before.
  return (
    isFinalPath ||
    maxMoto == null ||
    maxMoto < 1 ||
    (requireAllMotosFromEnv() ? motosFullyScored(rows, maxMoto) : anyMotoScored(rows, maxMoto))
  )
}

function fillPointsFromExistingPlace(
  rows: EventClassResult[],
  pointsByPosition: Map<number, number>,
  shouldAssignPoints: boolean,
): EventClassResult[] {
  return rows.map((row) => {
    const place = parsePlaceValue(row.overall_place)
    const points =
      !shouldAssignPoints || place == null ? 0 : (pointsByPosition.get(place) ?? 0)
    return {
      ...row,
      overall_points: points,
    }
  })
}

export function enrichClassResults(
  rows: EventClassResult[],
  pointsByPosition: Map<number, number>,
  maxMoto: number | null = null,
): EventClassResult[] {
  const needsFullCalc = classNeedsPointsCalc(rows)
  const needsPointsOnly = classNeedsPointsOnlyFill(rows)

  if (!needsFullCalc && !needsPointsOnly) {
    // Points already scored (or empty class) — leave unchanged aside from null → 0 display.
    if (pointsAllEmpty(rows)) return withZeroPoints(rows)
    return rows
  }

  const keys = activeScoringKeys(rows, maxMoto)
  if (keys.length === 0) return withZeroPoints(rows)

  const shouldAssignPoints = shouldAssignPointsForClass(rows, keys, maxMoto)

  if (needsPointsOnly) {
    return fillPointsFromExistingPlace(rows, pointsByPosition, shouldAssignPoints)
  }

  const lastKey = keys[keys.length - 1]!
  const ranked: RankedRider[] = rows.map((row) => {
    const allNonNumeric = !riderHasAnyNumericScore(row, keys)
    const sum = keys.reduce((total, key) => total + scoreForColumn(row, key), 0)
    return {
      row,
      sum,
      lastScore: scoreForColumn(row, lastKey),
      allNonNumeric,
    }
  })

  ranked.sort((a, b) => {
    if (a.allNonNumeric !== b.allNonNumeric) return a.allNonNumeric ? 1 : -1
    if (a.sum !== b.sum) return a.sum - b.sum
    return a.lastScore - b.lastScore
  })

  return ranked.map((entry, index) => {
    const place = index + 1
    // Incomplete motos: Place only for ranking, but show Points as 0 (column stays visible).
    const points = !shouldAssignPoints || entry.allNonNumeric ? 0 : (pointsByPosition.get(place) ?? 0)
    return {
      ...entry.row,
      overall_place: String(place),
      overall_points: points,
    }
  })
}

/** Enrich each class independently using optional per-class max moto. */
export function enrichEventResults(
  rows: EventClassResult[],
  pointsByPosition: Map<number, number>,
  maxMotoByClass: Map<number, number> = new Map(),
): EventClassResult[] {
  const byClass = new Map<number, EventClassResult[]>()
  for (const row of rows) {
    const list = byClass.get(row.class_id) ?? []
    list.push(row)
    byClass.set(row.class_id, list)
  }
  const enriched: EventClassResult[] = []
  for (const [classId, classRows] of byClass.entries()) {
    const maxMoto = maxMotoByClass.get(classId) ?? null
    enriched.push(...enrichClassResults(classRows, pointsByPosition, maxMoto))
  }
  return enriched
}
