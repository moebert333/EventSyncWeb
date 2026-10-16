import type { RaceStatus } from '../types/database'

const VIDEOS: Partial<Record<RaceStatus, string>> = {
  Staging: '/videos/start_race.mp4',
  Active: '/videos/active_race.mp4',
  Finished: '/videos/finish_race.mp4',
}

export function raceStatusVideoSrc(status: RaceStatus | null | undefined): string | null {
  return status ? (VIDEOS[status] ?? null) : null
}

type Props = {
  status: RaceStatus | null | undefined
  /** When true, render the looping muted clip. */
  showVideo: boolean
}

export function VideoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="6" width="13" height="12" rx="1.5" />
      <path d="M16 10l5-3v10l-5-3v-4z" />
    </svg>
  )
}

export function RaceStatusVideo({ status, showVideo }: Props) {
  const src = raceStatusVideoSrc(status)
  if (!src || !showVideo) return null

  return (
    <div id="race-status-video" className="mt-4 overflow-hidden border border-white/15 bg-black">
      <video
        key={src}
        className="block max-h-64 w-full object-contain"
        src={src}
        autoPlay
        loop
        muted
        playsInline
        aria-label="Race status video"
      />
    </div>
  )
}
