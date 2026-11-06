import { useEffect, useState } from 'react'
import { useEventCode } from '../hooks/useEventCode'
import {
  stagingInRaces,
  stagingLabelText,
  useEventRaceOrder,
  useParticipantRaceNums,
} from '../hooks/useEventRaceOrder'
import { notifyStaging } from '../lib/stagingNotify'

type UrgentLevel = 0 | 1 | 2 | 'inThisRace'

export function StagingAlert() {
  const { context, selectedParticipant } = useEventCode()
  const [dismissedFor, setDismissedFor] = useState<string | null>(null)
  const [notifiedFor, setNotifiedFor] = useState<string | null>(null)

  const eventId = context?.eventId ?? null
  const selectedForEvent =
    selectedParticipant && eventId != null && selectedParticipant.eventId === eventId
      ? selectedParticipant
      : null

  const racesQuery = useEventRaceOrder(selectedForEvent ? eventId : null)
  const participantRacesQuery = useParticipantRaceNums(
    selectedForEvent ? eventId : null,
    selectedForEvent?.participantId ?? null,
  )

  const stagingIn =
    selectedForEvent && racesQuery.data && participantRacesQuery.data
      ? stagingInRaces(racesQuery.data, participantRacesQuery.data)
      : null

  const urgent: UrgentLevel | null =
    stagingIn === 0 || stagingIn === 1 || stagingIn === 2 || stagingIn === 'inThisRace'
      ? stagingIn
      : null
  const activeRace = racesQuery.data?.find((race) => race.active)
  const activeRaceId = activeRace?.race_id ?? null
  const activeRaceStatus = urgent === 0 ? (activeRace?.status ?? null) : null
  const label =
    urgent != null
      ? stagingLabelText(urgent, activeRaceStatus, activeRace?.is_practice ?? false)
      : null
  // Include active race so a new race re-opens even when the message text matches.
  const alertKey =
    urgent != null && label != null && activeRaceId != null
      ? `${activeRaceId}:${urgent}:${label}`
      : null
  const open = alertKey != null && dismissedFor !== alertKey
  const flash = urgent === 0 || urgent === 1 || urgent === 'inThisRace'

  useEffect(() => {
    if (alertKey == null) {
      setDismissedFor(null)
      setNotifiedFor(null)
    }
  }, [alertKey])

  useEffect(() => {
    if (!open || label == null || urgent == null || alertKey == null || notifiedFor === alertKey) {
      return
    }
    setNotifiedFor(alertKey)
    void notifyStaging(label, urgent)
  }, [open, label, urgent, alertKey, notifiedFor])

  if (!open || label == null || urgent == null || alertKey == null) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-20"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={() => setDismissedFor(alertKey)}
    >
      <p
        className={`${flash ? 'staging-flash' : 'bg-yellow-300'} max-w-lg px-5 py-3 text-center text-xl font-bold text-black shadow-lg`}
      >
        {label}
      </p>
    </div>
  )
}
