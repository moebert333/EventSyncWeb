import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useEventCode } from '../hooks/useEventCode'
import {
  raceProgressLine,
  raceProgressParts,
  useEventRaceOrder,
  useParticipantRaceNums,
} from '../hooks/useEventRaceOrder'
import { riderName } from '../lib/format'
import { SelectParticipantBox } from './SelectParticipantBox'

/** Site header (safe area + bar) so this strip sticks just under it. */
const STICKY_TOP = 'top-[calc(3.75rem+env(safe-area-inset-top,0px))]'

type EventParticipantHeaderProps = {
  eventId: number
  eventName: string
  /** Current page name shown at the top of the strip. */
  pageTitle: ReactNode
  /** When false, stays in document flow (e.g. Active Race split layout). Default true. */
  sticky?: boolean
  /** Called after Ok or Skip when the picker closes (e.g. re-apply class results). */
  onParticipantChanged?: () => void
}

export function EventParticipantHeader({
  eventId,
  eventName,
  pageTitle,
  sticky = true,
  onParticipantChanged,
}: EventParticipantHeaderProps) {
  const { selectedParticipant } = useEventCode()
  const location = useLocation()
  const [picking, setPicking] = useState(false)
  const onLivePage =
    location.pathname === '/live' || location.pathname.startsWith('/live/')

  const selectedForEvent =
    selectedParticipant?.eventId === eventId ? selectedParticipant : null

  const racesQuery = useEventRaceOrder(selectedForEvent ? eventId : null)
  const participantRacesQuery = useParticipantRaceNums(
    selectedForEvent ? eventId : null,
    selectedForEvent?.participantId ?? null,
  )
  const progressLine =
    selectedForEvent && racesQuery.data && participantRacesQuery.data
      ? raceProgressLine(racesQuery.data, participantRacesQuery.data)
      : null
  const progressParts = progressLine ? raceProgressParts(progressLine) : null
  // "Active Race N" progress title is only for the live page; other pages use pageTitle.
  const titleLabel = onLivePage && progressParts?.title ? progressParts.title : pageTitle
  const statusDetail = progressParts?.detail ?? null
  const titleLinksToLive = onLivePage && progressParts?.title != null

  const participantLabel = selectedForEvent
    ? `${riderName(selectedForEvent.firstName, selectedForEvent.lastName)}${
        selectedForEvent.participantPlate ? ` · ${selectedForEvent.participantPlate}` : ''
      }`
    : 'Select Rider'

  function finishPick() {
    setPicking(false)
    onParticipantChanged?.()
  }

  return (
    <div
      id="event-participant-header"
      className={`${sticky ? `sticky ${STICKY_TOP}` : 'relative'} z-20 -mx-4 -mt-6 border-b border-[#f5c518]/35 bg-[#252525] px-4 py-2 shadow-[0_1px_0_rgb(0_0_0_/_0.4)]`}
    >
      <div className="space-y-1">
        <div className="flex min-h-[1.75rem] items-center gap-x-3">
          {titleLinksToLive ? (
            <Link
              to="/live"
              className="shrink-0 text-xl font-bold leading-tight !text-green-500 no-underline"
              title="Go to Active Race"
            >
              {titleLabel}
            </Link>
          ) : (
            <p className="shrink-0 text-xl font-bold leading-tight text-green-500">{titleLabel}</p>
          )}
          {statusDetail ? (
            <Link
              to="/order"
              state={{ skipProgressPopup: true }}
              className="min-w-0 flex-1 text-right text-lg font-semibold leading-tight !text-[#f0d56a] underline underline-offset-2 sm:text-center"
              title="Go to Race Order"
            >
              {statusDetail}
            </Link>
          ) : null}
        </div>
        <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-lg font-bold leading-tight">
          <span>
            <span className="text-zinc-400">Event:</span> <span className="text-white">{eventName}</span>
          </span>
          <span>
            <span className="text-zinc-400">Rider:</span>{' '}
            <button
              type="button"
              className="cursor-pointer bg-transparent p-0 font-[inherit] text-[length:inherit] font-bold text-[#f5c518] underline underline-offset-2"
              title={selectedForEvent ? 'Change selected rider' : 'Select a rider'}
              onClick={() => setPicking(true)}
            >
              {participantLabel}
            </button>
          </span>
        </p>
        {picking ? (
          <SelectParticipantBox eventId={eventId} onOk={finishPick} onSkip={finishPick} />
        ) : null}
      </div>
    </div>
  )
}
