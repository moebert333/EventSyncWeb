import type { RaceStatus } from '../types/database'

type RaceActivityIconProps = {
  status: RaceStatus | string | null
}

function iconTitle(status: string | null): string {
  switch (status) {
    case 'Staging':
      return 'Staging'
    case 'Active':
      return 'Race is active'
    case 'Paused':
      return 'Paused'
    case 'Finished':
      return 'Finished'
    default:
      return 'Race status'
  }
}

/** 3-light stack with amber on — Staging. */
function StagingIcon() {
  return (
    <>
      <rect
        x="7.25"
        y="2.75"
        width="9.5"
        height="18.5"
        rx="2.25"
        fill="#1a1a1a"
        stroke="currentColor"
        strokeWidth="1.25"
        opacity="0.95"
      />
      {/* Red — off */}
      <circle cx="12" cy="7" r="2.15" fill="#5a1f1f" />
      {/* Amber — pulses almost off → bright */}
      <circle cx="12" cy="12" r="2.15" fill="#f5c518">
        <animate attributeName="opacity" values="0.15;1;0.15" dur="1.2s" repeatCount="indefinite" />
      </circle>
      {/* Green — off */}
      <circle cx="12" cy="17" r="2.15" fill="#1f4a2a" />
    </>
  )
}

/** Irregular closed track loop (slightly wider than tall) with a rider-dot that laps while Active. */
const ACTIVE_TRACK =
  'M10.6 5.2 C13.4 4.4 16.4 4.8 18.6 5.6 C20.8 6.4 22.4 7.2 22 9.4 C21.6 11.2 19.2 11.2 19.6 12.8 C20.2 14.8 22.6 15.2 20.8 16.8 C19.2 18.4 16.8 17.4 15 18.4 C13.4 19.4 13.8 19.8 11.4 19.4 C8.6 18.9 9.4 16.8 7.2 16.2 C5 15.5 2.6 16.6 2.4 14.4 C2.2 12.4 5.2 12.6 5 10.8 C4.8 8.8 2.2 8.4 3.6 6.8 C5.2 4.9 8 5.6 10.6 5.2 Z'

function ActiveIcon() {
  return (
    <>
      <path
        d={ACTIVE_TRACK}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.55"
      />
      <path
        className="race-activity-track"
        d={ACTIVE_TRACK}
        fill="none"
        stroke="#f5c518"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
      />
      <circle className="race-activity-dot" r="2.2" fill="#f5c518">
        <animateMotion dur="3.6s" repeatCount="indefinite" path={ACTIVE_TRACK} />
      </circle>
    </>
  )
}

/** Amber caution triangle. */
function PausedIcon() {
  return (
    <>
      <path
        d="M12 3.6 21.2 19.5H2.8L12 3.6z"
        fill="#f5c518"
        stroke="#111111"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path d="M12 9.2v4.6" stroke="#111111" strokeWidth="1.85" strokeLinecap="round" />
      <circle cx="12" cy="16.15" r="1.05" fill="#111111" />
    </>
  )
}

/** Checkered flag — finish only. */
function FinishedIcon() {
  return (
    <>
      <path
        d="M5.5 3.5v17"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path d="M5.5 3.75h12.25l-1.1 4.15 1.1 4.15H5.5z" fill="#f5c518" />
      <path fill="#111111" d="M5.5 3.75h3.05v2.75H5.5zm6.1 0h3.05v2.75H11.6z" />
      <path fill="#111111" d="M8.55 6.5h3.05v2.75H8.55zm6.1 0h3.05l-.35 2.75H14.65z" />
      <path fill="#111111" d="M5.5 9.25h3.05v2.8H5.5zm6.1 0h3.05v2.8H11.6z" />
    </>
  )
}

/**
 * Square race-status mark beside "Active Race N".
 * Staging gate · Active track+dot · Paused caution · Finished checkered flag.
 */
export function RaceActivityIcon({ status }: RaceActivityIconProps) {
  const normalized = status ?? null
  const mark =
    normalized === 'Staging' ? (
      <StagingIcon />
    ) : normalized === 'Active' ? (
      <ActiveIcon />
    ) : normalized === 'Paused' ? (
      <PausedIcon />
    ) : normalized === 'Finished' ? (
      <FinishedIcon />
    ) : (
      <StagingIcon />
    )

  return (
    <svg
      className={`race-activity-icon inline-block h-[1.35em] w-[1.35em] shrink-0 align-[-0.2em] ${
        normalized === 'Active' ? 'is-active' : ''
      }`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      title={iconTitle(normalized)}
    >
      {mark}
    </svg>
  )
}
