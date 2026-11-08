import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEventCode } from '../hooks/useEventCode'
import { useEventParticipants } from '../hooks/useEventResults'
import { riderName } from '../lib/format'
import { saveParticipantAsResultsSelection } from '../lib/resultsSelection'
import type { EntryParticipant } from '../types/database'

type SelectParticipantBoxProps = {
  eventId: number
  /** When set, show Ok / Skip under the rider picker. */
  onOk?: () => void
  onSkip?: () => void
  actionsBusy?: boolean
}

export function SelectParticipantBox({ eventId, onOk, onSkip, actionsBusy = false }: SelectParticipantBoxProps) {
  const { selectedParticipant, setSelectedParticipant } = useEventCode()
  const ridersQuery = useEventParticipants(eventId)
  const [riderSearch, setRiderSearch] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const showActions = onOk != null || onSkip != null

  useEffect(() => {
    const input = searchInputRef.current
    if (!input) return
    // Defer so the portal is in the document before focusing.
    const id = window.requestAnimationFrame(() => {
      input.focus()
      input.select()
    })
    return () => window.cancelAnimationFrame(id)
  }, [])

  const selectedForEvent =
    selectedParticipant?.eventId === eventId ? selectedParticipant : null

  const needle = riderSearch.trim().toLowerCase()
  const riders = (ridersQuery.data ?? []).filter((rider) => {
    if (!needle) return true
    return `${rider.first_name} ${rider.last_name} ${rider.participant_plate ?? ''}`.toLowerCase().includes(needle)
  })
  const listOpen = needle.length > 0

  function chooseRider(rider: EntryParticipant) {
    setSelectedParticipant({
      eventId,
      participantId: rider.participant_id,
      firstName: rider.first_name,
      lastName: rider.last_name,
      participantPlate: rider.participant_plate,
    })
    saveParticipantAsResultsSelection(eventId, rider.participant_id)
    setRiderSearch('')
    onOk?.()
  }

  function confirmOk() {
    if (actionsBusy || !onOk) return
    if (riders.length === 1) {
      chooseRider(riders[0])
      return
    }
    onOk()
  }

  const panel = (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-20"
      role="dialog"
      aria-modal="true"
      aria-label="Select rider"
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return
        if (actionsBusy || !onOk) return
        // Rider list buttons already confirm on activation.
        if (event.target instanceof HTMLElement && event.target.closest('ul button')) return
        event.preventDefault()
        confirmOk()
      }}
    >
      <div className="grid w-full max-w-lg gap-3 border border-[#f5c518] bg-[#1a1a1a] p-4 shadow-lg">
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Select rider <span className="normal-case tracking-normal text-zinc-500">(optional)</span>
        </p>
        <label className="block text-sm uppercase tracking-wide text-zinc-400">
          Search name or plate
          <input
            ref={searchInputRef}
            className="control mt-1"
            title="Filter riders by name or plate"
            value={riderSearch}
            onChange={(event) => setRiderSearch(event.target.value)}
          />
        </label>
        {listOpen ? (
          <div>
            <p className="text-sm uppercase tracking-wide text-zinc-400">Select a Rider:</p>
            {riders.length === 0 ? (
              <p className="mt-1 border border-white/20 px-3 py-2 text-sm text-zinc-400">No matching riders</p>
            ) : (
              <ul className="mt-1 max-h-56 overflow-auto border border-white/20">
                {riders.map((rider) => {
                  const selected = selectedForEvent?.participantId === rider.participant_id
                  return (
                    <li key={rider.participant_id}>
                      <button
                        type="button"
                        className={`block w-full cursor-pointer px-3 py-2 text-left text-sm ${
                          selected ? 'bg-[#f5c518] font-bold text-black' : 'bg-transparent text-white hover:bg-white/10'
                        }`}
                        title={`Select ${riderName(rider.first_name, rider.last_name)}`}
                        onClick={() => chooseRider(rider)}
                      >
                        {riderName(rider.first_name, rider.last_name)}
                        {rider.participant_plate ? ` · ${rider.participant_plate}` : ''}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ) : (
          <label className="block text-sm uppercase tracking-wide text-zinc-400">
            Select a Rider:
            <select
              className="control mt-1"
              title="Choose a rider for this event"
              value={selectedForEvent?.participantId ?? ''}
              onChange={(event) => {
                const nextId = event.target.value ? Number(event.target.value) : null
                if (nextId == null) {
                  setSelectedParticipant(null)
                  return
                }
                const rider = (ridersQuery.data ?? []).find((row) => row.participant_id === nextId)
                if (!rider) {
                  setSelectedParticipant(null)
                  return
                }
                chooseRider(rider)
              }}
            >
              <option value="">Select a rider</option>
              {riders.map((rider) => (
                <option key={rider.participant_id} value={rider.participant_id}>
                  {riderName(rider.first_name, rider.last_name)}
                  {rider.participant_plate ? ` · ${rider.participant_plate}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        {selectedForEvent ? (
          <p className="text-sm text-zinc-300">
            {riderName(selectedForEvent.firstName, selectedForEvent.lastName)}
            {selectedForEvent.participantPlate ? ` · ${selectedForEvent.participantPlate}` : ''}
          </p>
        ) : null}
        {showActions ? (
          <div className="mt-1 flex flex-wrap gap-2">
            {onOk ? (
              <button
                type="button"
                className="btn"
                disabled={actionsBusy}
                title="Continue with the current rider choice"
                onClick={confirmOk}
              >
                {actionsBusy ? 'Checking…' : 'Ok'}
              </button>
            ) : null}
            {onSkip ? (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={actionsBusy}
                title="Continue without changing the rider"
                onClick={onSkip}
              >
                Skip
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )

  return createPortal(panel, document.body)
}
