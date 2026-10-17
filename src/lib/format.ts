export function formatEventDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const [year, month, day] = iso.slice(0, 10).split('-')
  if (!year || !month || !day) return iso
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatClock(value: string | null | undefined): string | null {
  if (!value) return null
  const match = /^(\d{1,2}):(\d{2})/.exec(value)
  if (!match) return value
  return `${match[1]}:${match[2]}`
}

/** Postgres `time`. Fractional values become m:ss.xx; whole seconds stay HH:MM:SS. */
export function formatRaceTime(value: string | null | undefined): string {
  if (!value) return '—'
  const match = /^(\d+):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(value.trim())
  if (!match) return value
  const hours = Number(match[1])
  const minutes = match[2] ?? '00'
  const seconds = match[3] ?? '00'
  const fraction = match[4]
  if (!fraction) return `${String(hours).padStart(2, '0')}:${minutes}:${seconds}`
  const hundredths = fraction.slice(0, 2).padEnd(2, '0')
  if (hours === 0) return `${Number(minutes)}:${seconds}.${hundredths}`
  return `${hours}:${minutes}:${seconds}.${hundredths}`
}

/** Whole seconds as HH:MM:SS. */
export function formatElapsedSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/** Postgres `time` truncated to whole seconds as HH:MM:SS. */
export function formatElapsedRaceTime(value: string | null | undefined): string {
  if (!value) return '—'
  const seconds = raceTimeSeconds(value)
  if (seconds == null) return value
  return formatElapsedSeconds(seconds)
}

/** Postgres `time` as seconds, for comparisons and the progress chart. */
export function raceTimeSeconds(value: string | null | undefined): number | null {
  if (!value) return null
  const match = /^(\d+):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  const fraction = match[4] ? Number(`0.${match[4]}`) : 0
  if (![hours, minutes, seconds, fraction].every(Number.isFinite)) return null
  return hours * 3600 + minutes * 60 + seconds + fraction
}

export function riderName(first: string, last: string): string {
  return `${first} ${last}`.trim()
}

export function placeRank(place: string | null | undefined): number {
  if (place == null || place === '') return 10_000
  if (place === 'DNS/DNF') return 9_000
  const numeric = Number(place)
  return Number.isFinite(numeric) ? numeric : 8_000
}

export function bestLapLabel(lapNum: number | null, lapTime: string | null): string {
  const time = formatRaceTime(lapTime)
  if (lapNum == null || lapNum === 0) return time
  return `#${lapNum} - ${time}`
}
