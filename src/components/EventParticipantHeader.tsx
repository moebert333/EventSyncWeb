import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useEventCode } from '../hooks/useEventCode'
import {
  raceProgressLine,
  raceProgressParts,
  useEventRaceOrder,
  useParticipantRaceNums,
} from '../hooks/useEventRaceOrder'
import { toggleEventHeaderCollapsed, useEventHeaderCollapsed } from '../lib/eventHeaderCollapse'
import { riderName } from '../lib/format'
import { SelectParticipantBox } from './SelectParticipantBox'

/** Site header (safe area + bar) so this strip sticks just under it. */
const STICKY_TOP = 'top-[calc(3.75rem+env(safe-area-inset-top,0px))]'

/** Mobile event name cap: total length including trailing `..` when truncated. */
const MOBILE_EVENT_NAME_MAX = 15

function truncateForMobile(name: string): string {
  if (name.length <= MOBILE_EVENT_NAME_MAX) return name
  return `${name.slice(0, MOBILE_EVENT_NAME_MAX - 2)}..`
}

type EventParticipantHeaderProps = {
  eventId: number
  eventName: string
  /** Current page name shown on the second line of the strip. */
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
  const { context, selectedParticipant } = useEventCode()
  const demoMode = Boolean(context?.demo)
  const [picking, setPicking] = useState(false)
  const [collapsed] = useEventHeaderCollapsed()
  const mobileEventName = truncateForMobile(eventName)

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
  const statusDetail = progressParts?.detail ?? null
  const detailStyle = progressParts?.detailStyle ?? 'none'
  const detailClass =
    detailStyle === 'yellowFlash'
      ? 'staging-flash shrink-0 px-2 py-0.5 text-right text-lg font-semibold leading-tight !text-black underline underline-offset-2'
      : detailStyle === 'yellow'
        ? 'shrink-0 bg-yellow-300 px-2 py-0.5 text-right text-lg font-semibold leading-tight !text-black underline underline-offset-2'
        : 'shrink-0 text-right text-lg font-semibold leading-tight !text-[#f0d56a] underline underline-offset-2'

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
      title={
        collapsed
          ? demoMode
            ? 'Show Event, Rider, and Demo banner'
            : 'Show Event and Rider'
          : demoMode
            ? 'Hide Event, Rider, and Demo banner'
            : 'Hide Event and Rider'
      }
      className={`${sticky ? `sticky ${STICKY_TOP}` : 'relative'} z-20 -mx-4 -mt-6 cursor-pointer border-b border-[#f5c518]/35 bg-[#252525] px-4 py-2 shadow-[0_1px_0_rgb(0_0_0_/_0.4)]`}
      onClick={() => toggleEventHeaderCollapsed()}
    >
      <div className="space-y-1">
        {!collapsed ? (
          <div className="flex min-h-[1.75rem] flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="min-w-0 text-lg font-bold leading-tight">
              <span className="text-zinc-400">Event:</span>{' '}
              {demoMode ? (
                <>
                  <span className="text-[#f5c518] md:hidden" title={eventName}>
                    DEMO MODE
                  </span>
                  <span className="hidden text-[#f5c518] md:inline" title={eventName}>
                    DEMO MODE - {eventName}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-white md:hidden" title={eventName}>
                    {mobileEventName}
                  </span>
                  <span className="hidden text-white md:inline">{eventName}</span>
                </>
              )}
            </p>
            <span className="shrink-0 text-right text-lg font-bold leading-tight">
              <span className="text-zinc-400">Rider:</span>{' '}
              <button
                type="button"
                className="cursor-pointer bg-transparent p-0 font-[inherit] text-[length:inherit] font-bold text-[#f5c518] underline underline-offset-2"
                title={selectedForEvent ? 'Change selected rider' : 'Select a rider'}
                onClick={(event) => {
                  event.stopPropagation()
                  setPicking(true)
                }}
              >
                {participantLabel}
              </button>
            </span>
          </div>
        ) : null}
        <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-lg font-bold leading-tight">
          <span className="shrink-0 text-xl font-bold leading-tight text-green-500">{pageTitle}</span>
          {statusDetail ? (
            <Link
              to="/order"
              state={{ skipProgressPopup: true }}
              className={detailClass}
              style={detailStyle !== 'none' ? { color: '#000' } : undefined}
              title="Go to Race Order"
              onClick={(event) => event.stopPropagation()}
            >
              {statusDetail}
            </Link>
          ) : null}
        </p>
        {picking ? (
          <div onClick={(event) => event.stopPropagation()}>
            <SelectParticipantBox eventId={eventId} onOk={finishPick} onSkip={finishPick} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
