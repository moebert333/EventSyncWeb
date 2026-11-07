import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { useEventCode } from '../hooks/useEventCode'
import { useEventRaceOrder } from '../hooks/useEventRaceOrder'
import { formatRaceTitle } from '../lib/format'
import { useSimulation } from '../lib/simulationContext'

const DEFAULT_LAP_SEC = 5
const MIN_LAP_SEC = 2
const MAX_LAP_SEC = 120
const LIVE_PATH = '/live'

function clampLapSec(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_LAP_SEC
  return Math.min(MAX_LAP_SEC, Math.max(MIN_LAP_SEC, Math.round(value)))
}

export function SimulationDialog() {
  const location = useLocation()
  const onLivePage = location.pathname === LIVE_PATH
  const { context } = useEventCode()
  const { isActive, starting, error, start, stop, closeDialog } = useSimulation()
  const racesQuery = useEventRaceOrder(context?.eventId ?? null)
  const races = (racesQuery.data ?? []).filter((race) => !race.is_practice)
  const [raceId, setRaceId] = useState<number | ''>('')
  const [lapSec, setLapSec] = useState(DEFAULT_LAP_SEC)
  const [lapError, setLapError] = useState<string | null>(null)
  const canConfigure = onLivePage && Boolean(context)

  useEffect(() => {
    if (races.length === 0) {
      setRaceId('')
      return
    }
    setRaceId((current) => {
      if (current !== '' && races.some((race) => race.race_id === current)) return current
      const preferred =
        races.find((race) => race.active) ?? races.find((race) => !race.completed) ?? races[0]
      return preferred.race_id
    })
  }, [races])

  async function confirmOk() {
    if (starting || !context || raceId === '' || !onLivePage) return
    const race = races.find((row) => row.race_id === raceId)
    if (!race) return
    if (!Number.isFinite(lapSec) || lapSec < MIN_LAP_SEC || lapSec > MAX_LAP_SEC) {
      setLapError(`Lap time must be between ${MIN_LAP_SEC} and ${MAX_LAP_SEC} seconds.`)
      setLapSec(clampLapSec(lapSec))
      return
    }
    setLapError(null)
    await start(race, clampLapSec(lapSec))
  }

  const panel = (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-20"
      role="dialog"
      aria-modal="true"
      aria-label="Race simulation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !starting) closeDialog()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !starting) {
          event.preventDefault()
          closeDialog()
        }
      }}
    >
      <div className="grid w-full max-w-lg gap-3 border border-[#f5c518] bg-[#1a1a1a] p-4 shadow-lg">
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          {isActive ? 'Simulation running' : 'Simulate race'}
        </p>

        {!onLivePage && !isActive ? (
          <p className="text-sm text-zinc-300">Go to Active Race to start a simulation.</p>
        ) : !context ? (
          <p className="text-sm text-zinc-300">Enter an event code on Home before starting a simulation.</p>
        ) : canConfigure ? (
          <>
            <label className="block text-sm uppercase tracking-wide text-zinc-400">
              Race
              <select
                className="control mt-1"
                title="Choose a race to simulate"
                value={raceId === '' ? '' : String(raceId)}
                disabled={starting || racesQuery.isLoading || isActive}
                onChange={(event) => {
                  const next = event.target.value
                  setRaceId(next ? Number(next) : '')
                }}
              >
                {races.length === 0 ? <option value="">No races for this event</option> : null}
                {races.map((race) => (
                  <option key={race.race_id} value={race.race_id}>
                    {formatRaceTitle(race.race_num, race.is_practice, race.race_name)}
                    {race.session_name ? ` · ${race.session_name}` : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm uppercase tracking-wide text-zinc-400">
              Approx. lap time (seconds)
              <input
                className="control mt-1"
                type="number"
                min={MIN_LAP_SEC}
                max={MAX_LAP_SEC}
                step={1}
                title={`Approximate lap time in seconds (${MIN_LAP_SEC}–${MAX_LAP_SEC})`}
                value={lapSec}
                disabled={starting || isActive}
                onChange={(event) => {
                  setLapError(null)
                  setLapSec(Number(event.target.value))
                }}
                onBlur={() => setLapSec((current) => clampLapSec(current))}
              />
            </label>
            {lapError ? <p className="text-sm text-red-300">{lapError}</p> : null}
          </>
        ) : null}

        {racesQuery.error ? (
          <p className="text-sm text-red-300">
            {racesQuery.error instanceof Error
              ? racesQuery.error.message
              : 'Could not load races.'}
          </p>
        ) : null}
        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        <div className="mt-1 flex flex-wrap gap-2">
          {isActive ? (
            <button
              type="button"
              className="btn"
              disabled={starting}
              title="Stop simulation and return to live data"
              onClick={() => {
                stop()
                closeDialog()
              }}
            >
              Stop simulation
            </button>
          ) : canConfigure ? (
            <button
              type="button"
              className="btn"
              disabled={starting || raceId === '' || races.length === 0}
              title="Start client-side race simulation"
              onClick={() => void confirmOk()}
            >
              {starting ? 'Starting…' : 'Ok'}
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost"
            disabled={starting}
            title="Close"
            onClick={closeDialog}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(panel, document.body)
}
