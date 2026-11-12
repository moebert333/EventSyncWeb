import { useLocation } from 'react-router-dom'
import {
  toggleEventHeaderCollapsed,
  useEventHeaderCollapsed,
} from '../lib/eventHeaderCollapse'
import { formatRaceTitle } from '../lib/format'
import { useSimulation } from '../lib/simulationContext'

const LIVE_PATH = '/live'

export function SimulationBanner() {
  const location = useLocation()
  const { isActive, isPaused, isDemoMode, raceInProgress, pause, resume, stop } = useSimulation()
  const [headerCollapsed] = useEventHeaderCollapsed()
  // Only on Active Race; demo banner also follows Event/Rider strip collapse.
  if (location.pathname !== LIVE_PATH) return null
  if (!isActive || !raceInProgress) return null
  if (isDemoMode && headerCollapsed) return null

  const title = formatRaceTitle(
    raceInProgress.race_num,
    raceInProgress.is_practice,
    raceInProgress.race_name,
  )
  const statusLabel = raceInProgress.status ? ` · ${raceInProgress.status}` : ''

  return (
    <div
      className={`border-b border-[#f5c518]/40 bg-[#f5c518]/15${isDemoMode ? ' cursor-pointer' : ''}`}
      title={isDemoMode ? 'Hide Event, Rider, and Demo banner' : undefined}
      onClick={isDemoMode ? () => toggleEventHeaderCollapsed() : undefined}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#f5c518]">
          {isDemoMode ? 'Demo' : 'Simulation'}
          {isPaused ? ' · Paused' : statusLabel} · {title}
        </p>
        <div className="ml-auto flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
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
