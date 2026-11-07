import { useState, type ReactNode } from 'react'
import { useEventCode } from '../hooks/useEventCode'
import {
  raceProgressLine,
  raceProgressParts,
  stagingInRaces,
  stagingLabelText,
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
  /** Called after Ok or Skip when the picker closes (e.g. re-apply class results). */
  onParticipantChanged?: () => void
}

export function EventParticipantHeader({
  eventId,
  eventName,
  pageTitle,
  onParticipantChanged,
}: EventParticipantHeaderProps) {
  const { selectedParticipant } = useEventCode()
  const [picking, setPicking] = useState(false)

  const selectedForEvent =
    selectedParticipant?.eventId === eventId ? selectedParticipant : null

  const racesQuery = useEventRaceOrder(selectedForEvent ? eventId : null)
  const participantRacesQuery = useParticipantRaceNums(
    selectedForEvent ? eventId : null,
    selectedForEvent?.participantId ?? null,
  )
  const stagingIn =
    selectedForEvent && racesQuery.data && participantRacesQuery.data
      ? stagingInRaces(racesQuery.data, participantRacesQuery.data)
      : null
  const activeRace = racesQuery.data?.find((race) => race.active) ?? null
  const activeIsPractice = activeRace?.is_practice ?? false
  const activeRaceStatus = stagingIn === 0 ? (activeRace?.status ?? null) : null
  const progressLine =
    selectedForEvent && racesQuery.data && participantRacesQuery.data
      ? raceProgressLine(racesQuery.data, participantRacesQuery.data)
      : null
  const progressParts = progressLine ? raceProgressParts(progressLine) : null
  const titleLabel = progressParts?.title ?? pageTitle
  const statusDetail = progressParts?.detail ?? null

  const participantLabel = selectedForEvent
    ? `${riderName(selectedForEvent.firstName, selectedForEvent.lastName)}${
        selectedForEvent.participantPlate ? ` · ${selectedForEvent.participantPlate}` : ''
      }`
    : 'Select Rider'

  function finishPick() {
    setPicking(false)
    onParticipantChanged?.()
  }

  const stagingFlash = stagingIn === 0 || stagingIn === 1 || stagingIn === 'inThisRace'
  const stagingClass = stagingFlash
    ? 'staging-flash px-2 py-0.5 font-bold text-black'
    : stagingIn === 2
      ? 'bg-yellow-300 px-2 py-0.5 font-bold text-black'
      : 'font-semibold text-zinc-300'

  const stagingLabel = stagingLabelText(stagingIn, activeRaceStatus, activeIsPractice)

  return (
    <div
      id="event-participant-header"
      className={`sticky ${STICKY_TOP} z-20 -mx-4 -mt-6 border-b border-[#f5c518]/35 bg-[#252525] px-4 py-2 shadow-[0_1px_0_rgb(0_0_0_/_0.4)]`}
    >
      <div className="space-y-1">
        <div className="flex min-h-[1.75rem] items-center gap-x-3">
          <p className="shrink-0 text-xl font-bold leading-tight text-green-500">{titleLabel}</p>
          {statusDetail ? (
            <p className="min-w-0 flex-1 text-right text-lg font-semibold leading-tight text-zinc-300 sm:text-center">
              {statusDetail}
            </p>
          ) : null}
        </div>
        <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-lg font-bold leading-tight">
          <span>
            <span className="text-zinc-400">Event:</span> <span className="text-white">{eventName}</span>
          </span>
          <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
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
            {stagingLabel != null ? <span className={stagingClass}>{stagingLabel}</span> : null}
          </span>
        </p>
        {picking ? (
          <SelectParticipantBox eventId={eventId} onOk={finishPick} onSkip={finishPick} />
        ) : null}
      </div>
    </div>
  )
}
