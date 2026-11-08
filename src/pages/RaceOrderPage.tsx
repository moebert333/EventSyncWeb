import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { EventParticipantHeader } from '../components/EventParticipantHeader'
import { Skeleton } from '../components/Skeleton'
import { statusToneClass } from '../components/StatusPill'
import { useEventCode } from '../hooks/useEventCode'
import {
  raceProgressLine,
  raceProgressMessage,
  useClassParticipants,
  useEventRaceOrder,
  useParticipantRaceNums,
} from '../hooks/useEventRaceOrder'
import { formatRaceTitle, formatSessionName, riderName, sessionsShareCommonPrefix } from '../lib/format'
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
function scrollRaceIntoView(raceId: number): boolean {
  const el = document.getElementById(`race-order-${raceId}`)
  if (!el) return false
  const gap = 8
  const delta = el.getBoundingClientRect().top - stickyBarsBottom() - gap
  if (Math.abs(delta) >= 1) {
    window.scrollBy({ top: delta, behavior: 'smooth' })
  }
  return true
}

function isBeforeActiveRace(
  race: EventRaceOrderRow,
  activeRace: EventRaceOrderRow | null,
): boolean {
  if (!activeRace || race.race_id === activeRace.race_id) return false
  // Practice sessions run before competitive races.
  if (race.is_practice && !activeRace.is_practice) return true
  if (!race.is_practice && activeRace.is_practice) return false
  return race.race_num < activeRace.race_num
}

function raceTone(
  race: EventRaceOrderRow,
  isParticipantRace: boolean,
  activeRace: EventRaceOrderRow | null,
): string {
  if (race.active) return 'border-green-500 bg-green-500/15'
  if (isParticipantRace) {
    // Past participant races: light grey fill, same outline as non-participant races.
    // Upcoming: light blue fill with blue outline.
    if (isBeforeActiveRace(race, activeRace)) return 'border-white/15 bg-zinc-400/25'
    return 'border-sky-400 bg-sky-400/15'
  }
  if (race.completed) return 'border-zinc-600 bg-zinc-800/80'
  return 'border-white/15 bg-[#1a1a1a]'
}

function ClassParticipants({
  eventId,
  raceClass,
}: {
  eventId: number
  raceClass: EventRaceOrderClass
}) {
  const { selectedParticipant, setSelectedParticipant } = useEventCode()
  const ridersQuery = useClassParticipants(eventId, raceClass.class_id)
  const [pendingRider, setPendingRider] = useState<EntryParticipant | null>(null)

  const selectedForEvent =
    selectedParticipant?.eventId === eventId ? selectedParticipant : null

  function requestChooseRider(rider: EntryParticipant) {
    if (selectedForEvent?.participantId === rider.participant_id) return
    setPendingRider(rider)
  }

  function confirmChooseRider() {
    if (!pendingRider) return
    setSelectedParticipant({
      eventId,
      participantId: pendingRider.participant_id,
      firstName: pendingRider.first_name,
      lastName: pendingRider.last_name,
      participantPlate: pendingRider.participant_plate,
    })
    setPendingRider(null)
  }

  const pendingName = pendingRider
    ? riderName(pendingRider.first_name, pendingRider.last_name)
    : ''

  return (
    <div className="border-t border-white/10 px-3 py-2">
      <p className="text-sm font-semibold text-[#f5c518]">{raceClass.class_name}</p>
      {ridersQuery.isLoading ? <p className="mt-1 text-sm text-zinc-400">Loading riders…</p> : null}
      {ridersQuery.error ? (
        <div className="mt-1" role="alert">
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
        <p className="mt-1 text-sm text-zinc-400">No riders entered in this class.</p>
      ) : null}
      {(ridersQuery.data?.length ?? 0) > 0 ? (
        <ul className="mt-1 space-y-0.5">
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
                  onClick={() => requestChooseRider(rider)}
                >
                  {riderName(rider.first_name, rider.last_name)}
                  {rider.participant_plate ? ` · ${rider.participant_plate}` : ''}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
      {pendingRider
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 py-20"
              role="dialog"
              aria-modal="true"
              aria-label="Confirm rider"
            >
              <div className="grid w-full max-w-lg gap-4 border border-[#f5c518] bg-[#1a1a1a] p-4 shadow-lg">
                <p className="text-base text-white">
                  Select {pendingName}
                  {pendingRider.participant_plate ? ` · ${pendingRider.participant_plate}` : ''} as
                  your rider?
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn"
                    title={`Confirm ${pendingName}`}
                    onClick={confirmChooseRider}
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    title="Cancel rider selection"
                    onClick={() => setPendingRider(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

function RaceRow({
  eventId,
  race,
  isParticipantRace,
  participantDisplayName,
  activeRace,
  stripSessionPrefix,
}: {
  eventId: number
  race: EventRaceOrderRow
  isParticipantRace: boolean
  participantDisplayName: string | null
  activeRace: EventRaceOrderRow | null
  stripSessionPrefix: boolean
}) {
  const [openClassIds, setOpenClassIds] = useState<number[]>([])
  // Order: Rider, Completed, then Active / exact status.
  const labels: string[] = []
  if (isParticipantRace) labels.push('Rider')
  if (race.completed) labels.push('Completed')
  if (race.active) {
    // Exact status (Staging / Paused / …) only when the selected rider is in this race.
    labels.push(isParticipantRace ? (race.status ?? 'Active') : 'Active')
  }

  const raceTitle = formatRaceTitle(race.race_num, race.is_practice, race.race_name)
  const sessionLabel = formatSessionName(race.session_name, stripSessionPrefix)
  const openClasses = race.classes.filter((raceClass) => openClassIds.includes(raceClass.class_id))

  function badgeClass(label: string): string {
    if (statusToneClass[label]) return statusToneClass[label]
    if (label === 'Rider') return 'bg-sky-400 text-black'
    return 'bg-zinc-600 text-white'
  }

  function toggleClass(classId: number) {
    setOpenClassIds((current) =>
      current.includes(classId) ? current.filter((id) => id !== classId) : [...current, classId],
    )
  }

  function onRowBackgroundClick(event: MouseEvent<HTMLLIElement>) {
    const target = event.target
    if (!(target instanceof Element)) return
    // Keep class toggles, View Race, and rider selection working.
    if (target.closest('a, button')) return
    // Row click only collapses; class name buttons are the sole expand path.
    if (openClassIds.length > 0) setOpenClassIds([])
  }

  return (
    <li
      id={`race-order-${race.race_id}`}
      className={`cursor-pointer border ${RACE_SCROLL_MARGIN} ${raceTone(race, isParticipantRace, activeRace)}`}
      onClick={onRowBackgroundClick}
    >
      <div className="min-h-11 px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-display text-xl font-bold uppercase">{raceTitle}</span>
          {labels.map((label) => (
            <span key={label} className="inline-flex items-center gap-x-2">
              <span
                className={`inline-flex px-2 py-0.5 text-xs font-bold uppercase ${badgeClass(label)}`}
              >
                {label}
              </span>
              {label === 'Rider' && participantDisplayName ? (
                <span className="text-sm font-semibold normal-case text-sky-300">
                  {participantDisplayName}
                </span>
              ) : null}
            </span>
          ))}
          {race.active ? (
            <Link
              to="/live"
              className="text-sm font-normal text-[#f0d56a] underline underline-offset-2"
              title={
                race.is_practice ? 'Go to the Active Practice page' : 'Go to the Active Race page'
              }
            >
              {race.is_practice ? 'View Practice' : 'View Race'}
            </Link>
          ) : null}
        </div>
        {sessionLabel || race.classes.length > 0 ? (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
            {sessionLabel ? <span className="text-zinc-400">{sessionLabel}:</span> : null}
            {race.classes.length === 0 ? (
              <span className="text-zinc-500">No classes listed</span>
            ) : (
              race.classes.map((raceClass, index) => {
                const open = openClassIds.includes(raceClass.class_id)
                return (
                  <span key={raceClass.class_id} className="inline-flex items-center">
                    {index > 0 ? <span className="mr-1 text-zinc-400">,</span> : null}
                    <button
                      type="button"
                      className="cursor-pointer bg-transparent p-0 font-normal text-[#f0d56a] underline underline-offset-2"
                      aria-expanded={open}
                      title={
                        open
                          ? `Hide riders in ${raceClass.class_name}`
                          : `Show riders in ${raceClass.class_name}`
                      }
                      onClick={() => toggleClass(raceClass.class_id)}
                    >
                      {raceClass.class_name}
                    </button>
                  </span>
                )
              })
            )}
          </div>
        ) : null}
      </div>
      {openClasses.map((raceClass) => (
        <ClassParticipants key={raceClass.class_id} eventId={eventId} raceClass={raceClass} />
      ))}
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
  const [progressOpen, setProgressOpen] = useState(false)
  const [progressShownFor, setProgressShownFor] = useState<string | null>(null)
  const [practiceOpen, setPracticeOpen] = useState(true)
  const [racesOpen, setRacesOpen] = useState(true)
  const scrolledForKey = useRef<string | null>(null)

  const races = racesQuery.data ?? []
  const practiceRaces = races.filter((race) => race.is_practice)
  const competitiveRaces = races.filter((race) => !race.is_practice)
  const activeRace = races.find((race) => race.active) ?? null
  const activeRaceId = activeRace?.race_id ?? null
  const activeRaceIsPractice = activeRace?.is_practice ?? null
  const activeScrollKey =
    activeRaceId != null && activeRaceIsPractice != null
      ? `${location.key}:${activeRaceId}:${activeRaceIsPractice ? 'p' : 'r'}`
      : null

  const selectedForEvent =
    selectedParticipant && context && selectedParticipant.eventId === context.eventId
      ? selectedParticipant
      : null
  const progressLine =
    selectedForEvent && racesQuery.data && participantRacesQuery.data
      ? raceProgressLine(racesQuery.data, participantRacesQuery.data)
      : null
  const progressRaceText = progressLine ? raceProgressMessage(progressLine) : null
  const progressName =
    selectedForEvent && progressRaceText
      ? riderName(selectedForEvent.firstName, selectedForEvent.lastName)
      : null

  // One toast per visit (location.key) + participant, once race data is ready.
  // Skip when arriving from the title-strip status link (same message already shown there).
  const skipProgressPopup =
    (location.state as { skipProgressPopup?: boolean } | null)?.skipProgressPopup === true
  const progressTriggerKey = participantId != null ? `${location.key}:${participantId}` : null

  useEffect(() => {
    if (progressTriggerKey == null || progressName == null || progressRaceText == null) {
      setProgressOpen(false)
      return
    }
    if (progressShownFor === progressTriggerKey) return
    setProgressShownFor(progressTriggerKey)
    if (skipProgressPopup) {
      setProgressOpen(false)
      return
    }
    setProgressOpen(true)
  }, [progressTriggerKey, progressName, progressRaceText, progressShownFor, skipProgressPopup])

  useEffect(() => {
    if (!progressOpen) return
    const timer = window.setTimeout(() => setProgressOpen(false), 5000)
    return () => window.clearTimeout(timer)
  }, [progressOpen])

  // Expand/collapse sections for the active race on page visit / active change.
  // Scroll runs in a layout effect after this state is committed so positions are final
  // (e.g. Practice Sessions collapsed before measuring a normal race).
  useEffect(() => {
    if (activeRaceId == null || activeRaceIsPractice == null) return
    setPracticeOpen(activeRaceIsPractice)
    if (!activeRaceIsPractice) setRacesOpen(true)
  }, [activeRaceId, activeRaceIsPractice, location.key])

  useLayoutEffect(() => {
    if (activeScrollKey == null || activeRaceId == null || activeRaceIsPractice == null) return
    if (scrolledForKey.current === activeScrollKey) return

    const sectionOpen = activeRaceIsPractice ? practiceOpen : racesOpen
    if (!sectionOpen) return
    // Wait until practice is collapsed when a normal race is active so layout is final.
    if (!activeRaceIsPractice && practiceRaces.length > 0 && practiceOpen) return

    if (!scrollRaceIntoView(activeRaceId)) return
    scrolledForKey.current = activeScrollKey
  }, [
    activeScrollKey,
    activeRaceId,
    activeRaceIsPractice,
    practiceOpen,
    racesOpen,
    practiceRaces.length,
  ])

  if (!context) return <Navigate to="/?needCode=1" replace />

  const participantRaceIds = new Set(participantRacesQuery.data ?? [])
  const stripSessionPrefix = sessionsShareCommonPrefix(races.map((race) => race.session_name))

  const participantDisplayName = selectedForEvent
    ? riderName(selectedForEvent.firstName, selectedForEvent.lastName)
    : null

  function renderRaceList(list: EventRaceOrderRow[]) {
    return (
      <ul className="space-y-2">
        {list.map((race) => (
          <RaceRow
            key={race.race_id}
            eventId={context!.eventId}
            race={race}
            isParticipantRace={participantRaceIds.has(race.race_id)}
            participantDisplayName={participantDisplayName}
            activeRace={activeRace}
            stripSessionPrefix={stripSessionPrefix}
          />
        ))}
      </ul>
    )
  }

  return (
    <div className="space-y-5">
      <EventParticipantHeader
        eventId={context.eventId}
        eventName={context.eventName}
        pageTitle="Race Order"
      />

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
        <div className="space-y-6">
          {practiceRaces.length > 0 ? (
            <section className="space-y-2">
              <button
                type="button"
                className="inline-flex cursor-pointer items-center gap-2 bg-transparent p-0 text-left"
                aria-expanded={practiceOpen}
                title={practiceOpen ? 'Hide Practice Sessions' : 'Show Practice Sessions'}
                onClick={() => setPracticeOpen((open) => !open)}
              >
                <span className="font-display text-xl font-bold uppercase text-[#f0d56a] underline underline-offset-2">
                  Practice Sessions
                </span>
                <span className="text-base leading-none text-[#f5c518]" aria-hidden="true">
                  {practiceOpen ? '▲' : '▼'}
                </span>
              </button>
              {practiceOpen ? renderRaceList(practiceRaces) : null}
            </section>
          ) : null}
          {competitiveRaces.length > 0 ? (
            <section className="space-y-2">
              <button
                type="button"
                className="inline-flex cursor-pointer items-center gap-2 bg-transparent p-0 text-left"
                aria-expanded={racesOpen}
                title={racesOpen ? 'Hide Races' : 'Show Races'}
                onClick={() => setRacesOpen((open) => !open)}
              >
                <span className="font-display text-xl font-bold uppercase text-[#f0d56a] underline underline-offset-2">
                  Races
                </span>
                <span className="text-base leading-none text-[#f5c518]" aria-hidden="true">
                  {racesOpen ? '▲' : '▼'}
                </span>
              </button>
              {racesOpen ? renderRaceList(competitiveRaces) : null}
            </section>
          ) : null}
        </div>
      ) : null}

      {progressOpen && progressName && progressRaceText
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-20"
              role="dialog"
              aria-modal="true"
              aria-label={`${progressName}. ${progressRaceText}`}
              onClick={() => setProgressOpen(false)}
            >
              <div className="max-w-lg border border-[#f5c518] bg-[#1a1a1a] px-5 py-3 text-center text-xl font-bold text-white shadow-lg">
                <p>{progressName}</p>
                <p className="mt-1 font-semibold text-zinc-200">{progressRaceText}</p>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
