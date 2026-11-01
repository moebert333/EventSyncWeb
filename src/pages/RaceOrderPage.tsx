import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { EventParticipantHeader } from '../components/EventParticipantHeader'
import { Skeleton } from '../components/Skeleton'
import { statusToneClass } from '../components/StatusPill'
import { useEventCode } from '../hooks/useEventCode'
import {
  useClassParticipants,
  useEventRaceOrder,
  useParticipantRaceNums,
} from '../hooks/useEventRaceOrder'
import { riderName } from '../lib/format'
import type { EntryParticipant, EventRaceOrderClass, EventRaceOrderRow } from '../types/database'

/** Fallback when sticky bars cannot be measured yet. */
const RACE_SCROLL_MARGIN =
  'scroll-mt-[calc(3.75rem+env(safe-area-inset-top,0px)+5.5rem)]'

function stickyBarsBottom(): number {
  const strip = document.getElementById('event-participant-header')
  if (strip) return strip.getBoundingClientRect().bottom
  const siteHeader = document.querySelector('header')
  return siteHeader?.getBoundingClientRect().bottom ?? 0
}

/** Scroll a race row into view just below the site header + Event/Participant strip. */
function scrollRaceIntoView(raceId: number) {
  const el = document.getElementById(`race-order-${raceId}`)
  if (!el) return
  const gap = 8
  const delta = el.getBoundingClientRect().top - stickyBarsBottom() - gap
  if (Math.abs(delta) < 1) return
  window.scrollBy({ top: delta, behavior: 'smooth' })
}

function raceTone(race: EventRaceOrderRow, isParticipantRace: boolean): string {
  if (race.active) return 'border-green-500 bg-green-500/15'
  if (isParticipantRace) return 'border-sky-400 bg-sky-400/15'
  if (race.completed) return 'border-zinc-600 bg-zinc-800/80'
  return 'border-white/15 bg-[#1a1a1a]'
}

function ClassRow({
  eventId,
  raceClass,
}: {
  eventId: number
  raceClass: EventRaceOrderClass
}) {
  const { selectedParticipant, setSelectedParticipant } = useEventCode()
  const [open, setOpen] = useState(false)
  const ridersQuery = useClassParticipants(open ? eventId : null, open ? raceClass.class_id : null)

  const selectedForEvent =
    selectedParticipant?.eventId === eventId ? selectedParticipant : null

  function chooseRider(rider: EntryParticipant) {
    setSelectedParticipant({
      eventId,
      participantId: rider.participant_id,
      firstName: rider.first_name,
      lastName: rider.last_name,
      participantPlate: rider.participant_plate,
    })
  }

  return (
    <li>
      <button
        type="button"
        className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 bg-transparent px-0 py-1.5 text-left text-sm font-semibold text-[#f5c518] underline underline-offset-2"
        aria-expanded={open}
        title={open ? `Hide riders in ${raceClass.class_name}` : `Show riders in ${raceClass.class_name}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{raceClass.class_name}</span>
        <span className="shrink-0 no-underline" aria-hidden="true">
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open ? (
        <div className="mb-2 border border-white/10 bg-black/20 px-2 py-2">
          {ridersQuery.isLoading ? <p className="text-sm text-zinc-400">Loading riders…</p> : null}
          {ridersQuery.error ? (
            <div role="alert">
              <p className="text-sm text-red-400">
                {ridersQuery.error instanceof Error ? ridersQuery.error.message : 'Could not load riders.'}
              </p>
              <button
                type="button"
                className="btn btn-ghost mt-2"
                title="Retry loading riders"
                onClick={() => void ridersQuery.refetch()}
              >
                Retry
              </button>
            </div>
          ) : null}
          {ridersQuery.isSuccess && (ridersQuery.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-zinc-400">No riders entered in this class.</p>
          ) : null}
          {(ridersQuery.data?.length ?? 0) > 0 ? (
            <ul className="space-y-0.5">
              {ridersQuery.data!.map((rider) => {
                const selected = selectedForEvent?.participantId === rider.participant_id
                return (
                  <li key={rider.participant_id}>
                    <button
                      type="button"
                      className={`block w-full cursor-pointer px-2 py-1.5 text-left text-sm ${
                        selected
                          ? 'bg-[#f5c518] font-bold text-black'
                          : 'bg-transparent text-white hover:bg-white/10'
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
          ) : null}
          <button
            type="button"
            className="mt-2 text-xs font-semibold uppercase tracking-wide text-zinc-400 underline underline-offset-2"
            title={`Hide riders in ${raceClass.class_name}`}
            onClick={() => setOpen(false)}
          >
            Collapse
          </button>
        </div>
      ) : null}
    </li>
  )
}

function RaceRow({
  eventId,
  race,
  isParticipantRace,
}: {
  eventId: number
  race: EventRaceOrderRow
  isParticipantRace: boolean
}) {
  const [open, setOpen] = useState(false)
  const labels: string[] = []
  if (race.completed) labels.push('Completed')
  if (race.active) labels.push(race.status ?? 'Active')
  if (isParticipantRace) labels.push('Participant')

  function badgeClass(label: string): string {
    if (statusToneClass[label]) return statusToneClass[label]
    if (label === 'Participant') return 'bg-sky-400 text-black'
    return 'bg-zinc-600 text-white'
  }

  return (
    <li
      id={`race-order-${race.race_id}`}
      className={`border ${RACE_SCROLL_MARGIN} ${raceTone(race, isParticipantRace)}`}
    >
      <button
        type="button"
        className="flex min-h-11 w-full cursor-pointer items-start justify-between gap-3 bg-transparent px-3 py-2 text-left"
        aria-expanded={open}
        title={open ? 'Hide classes for this race' : 'Show classes for this race'}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="min-w-0">
          <span className="font-display text-xl font-bold uppercase">
            Race {race.race_num}
            {race.race_name ? ` · ${race.race_name}` : ''}
          </span>
          {race.session_name || labels.length > 0 ? (
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              {race.session_name ? <span className="text-sm text-zinc-400">{race.session_name}</span> : null}
              {labels.map((label) => (
                <span
                  key={label}
                  className={`inline-flex px-2 py-0.5 text-xs font-bold uppercase ${badgeClass(label)}`}
                >
                  {label}
                </span>
              ))}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-[#f5c518]" aria-hidden="true">
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open ? (
        <div className="border-t border-white/10 px-3 py-2">
          {race.classes.length === 0 ? (
            <p className="text-sm text-zinc-400">No classes listed for this race.</p>
          ) : (
            <ul className="space-y-1">
              {race.classes.map((raceClass) => (
                <ClassRow key={raceClass.class_id} eventId={eventId} raceClass={raceClass} />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </li>
  )
}

export function RaceOrderPage() {
  const location = useLocation()
  const { context, selectedParticipant } = useEventCode()
  const racesQuery = useEventRaceOrder(context?.eventId ?? null)
  const participantId =
    selectedParticipant && context && selectedParticipant.eventId === context.eventId
      ? selectedParticipant.participantId
      : null
  const participantRacesQuery = useParticipantRaceNums(context?.eventId ?? null, participantId)

  const races = racesQuery.data ?? []
  const activeRaceId = races.find((race) => race.active)?.race_id ?? null

  // Scroll on every visit to this page (location.key) and when the active race changes.
  useEffect(() => {
    if (activeRaceId == null) return
    let cancelled = false
    const frame = window.requestAnimationFrame(() => {
      if (cancelled) return
      scrollRaceIntoView(activeRaceId)
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
    }
  }, [activeRaceId, location.key])

  if (!context) return <Navigate to="/?needCode=1" replace />

  const participantRaceNums = new Set(participantRacesQuery.data ?? [])

  return (
    <div className="space-y-5">
      <EventParticipantHeader eventId={context.eventId} eventName={context.eventName} />
      <h1 className="font-display text-xl font-extrabold uppercase text-sky-400">Race Order</h1>

      {racesQuery.isLoading ? <Skeleton rows={6} /> : null}
      {racesQuery.error ? (
        <div className="panel" role="alert">
          <p>{racesQuery.error instanceof Error ? racesQuery.error.message : 'Could not load race order.'}</p>
          <button
            type="button"
            className="btn mt-4"
            title="Retry loading race order"
            onClick={() => void racesQuery.refetch()}
          >
            Retry
          </button>
        </div>
      ) : null}
      {racesQuery.isSuccess && races.length === 0 ? (
        <p className="panel">No races are listed for this event yet.</p>
      ) : null}
      {races.length > 0 ? (
        <ul className="space-y-2">
          {races.map((race) => (
            <RaceRow
              key={race.race_id}
              eventId={context.eventId}
              race={race}
              isParticipantRace={participantRaceNums.has(race.race_num)}
            />
          ))}
        </ul>
      ) : null}
    </div>
  )
}
