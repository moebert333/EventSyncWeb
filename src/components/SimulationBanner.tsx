import { formatRaceTitle } from '../lib/format'
import { useSimulation } from '../lib/simulationContext'

export function SimulationBanner() {
  const { isActive, isPaused, isDemoMode, raceInProgress, pause, resume, stop } = useSimulation()
  if (!isActive || !raceInProgress) return null

  const title = formatRaceTitle(
    raceInProgress.race_num,
    raceInProgress.is_practice,
    raceInProgress.race_name,
  )
  const statusLabel = raceInProgress.status ? ` · ${raceInProgress.status}` : ''

  return (
    <div className="border-b border-[#f5c518]/40 bg-[#f5c518]/15">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#f5c518]">
          {isDemoMode ? 'Demo' : 'Simulation'}
          {isPaused ? ' · Paused' : statusLabel} · {title}
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          {isPaused ? (
            <button
              type="button"
              className="btn min-h-9 px-3 text-sm"
              title="Continue simulation"
              onClick={resume}
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-ghost min-h-9 px-3 text-sm"
              title="Pause simulation"
              onClick={pause}
            >
              Pause
            </button>
          )}
          {!isDemoMode ? (
            <button
              type="button"
              className="btn btn-ghost min-h-9 px-3 text-sm"
              title="Stop simulation and return to live data"
              onClick={stop}
            >
              Stop
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
