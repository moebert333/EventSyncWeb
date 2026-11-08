import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { EventParticipantHeader } from '../components/EventParticipantHeader'
import { Skeleton } from '../components/Skeleton'
import { useEventCode } from '../hooks/useEventCode'
import {
  raceOptionLabel,
  useEventClasses,
  useEventParticipants,
  useEventRaces,
  useEventResults,
  useOrgEvents,
  useOrgSeries,
  type ResultsFilter,
} from '../hooks/useEventResults'
import { formatEventDate, riderName } from '../lib/format'
import { motoKeysUpTo } from '../lib/resultsPoints'
import {
  clearResultsSelection,
  loadResultsSelection,
  saveResultsSelection,
  type ResultsMode,
  type StoredResultsSelection,
} from '../lib/resultsSelection'
import type { EventClassResult } from '../types/database'

const OPTIONAL_COLUMNS: { key: keyof EventClassResult; label: string }[] = [
  { key: 'make', label: 'Make' },
  { key: 'overall_points', label: 'Points' },
  { key: 'race1_place', label: 'Moto 1' },
  { key: 'race2_place', label: 'Moto 2' },
  { key: 'race3_place', label: 'Moto 3' },
  { key: 'semi1_place', label: 'Semi 1' },
  { key: 'semi2_place', label: 'Semi 2' },
  { key: 'lcq_place', label: 'LCQ' },
  { key: 'finals_place', label: 'Final' },
]

function cell(value: string | number | null): string {
  if (value == null || value === '') return '—'
  return String(value)
}

function optionalColumnsFor(rows: EventClassResult[], maxMoto: number | null) {
  const forcedMoto = new Set<keyof EventClassResult>(
    maxMoto != null && maxMoto >= 1 ? motoKeysUpTo(maxMoto) : [],
  )
  const showPoints =
    rows.length > 0 &&
    rows.every((row) => row.overall_points == null || row.overall_points === 0)

  return OPTIONAL_COLUMNS.filter((column) => {
    if (forcedMoto.has(column.key)) return true
    if (column.key === 'overall_points' && showPoints) return true
    return rows.some((row) => {
      const value = row[column.key]
      return value != null && value !== ''
    })
  })
}

function groupResultsByClass(rows: EventClassResult[]): { className: string; rows: EventClassResult[] }[] {
  const groups = new Map<string, EventClassResult[]>()
  for (const row of rows) {
    const list = groups.get(row.class_name) ?? []
    list.push(row)
    groups.set(row.class_name, list)
  }
  return [...groups.entries()].map(([className, classRows]) => ({ className, rows: classRows }))
}

function applyParticipantDefault(
  participantId: number,
  eventId: number,
  setters: {
    setMode: (mode: ResultsMode) => void
    setClassName: (name: string) => void
    setEventId: (id: number) => void
    setParticipantId: (id: number | '') => void
    setRaceId: (id: number | '') => void
    setRequest: (request: ResultsFilter | null) => void
    setSelectOpen: (open: boolean) => void
  },
) {
  setters.setMode('participant')
  setters.setClassName('')
  setters.setEventId(eventId)
  setters.setParticipantId(participantId)
  setters.setRaceId('')
  setters.setRequest({
    eventId,
    className: null,
    participantId,
    raceId: null,
  })
  setters.setSelectOpen(false)
}

export function CompletedRacesPage() {
  const { context, selectedParticipant } = useEventCode()
  const savedSelection = useMemo(() => loadResultsSelection(), [])
  const seriesQuery = useOrgSeries(context?.organizationId ?? null)
  const seriesIds = (seriesQuery.data ?? []).map((series) => series.series_id)
  const eventsQuery = useOrgEvents(seriesIds)
  const [seriesFilter, setSeriesFilter] = useState<number | 'all'>(
    savedSelection?.seriesFilter ?? context?.seriesId ?? 'all',
  )
  const [eventId, setEventId] = useState<number | null>(savedSelection?.eventId ?? context?.eventId ?? null)
  const [mode, setMode] = useState<ResultsMode>(savedSelection?.mode ?? 'class')
  const [className, setClassName] = useState(savedSelection?.className ?? '')
  const [participantId, setParticipantId] = useState<number | ''>(savedSelection?.participantId ?? '')
  const [raceId, setRaceId] = useState<number | ''>(savedSelection?.raceId ?? '')
  const [riderSearch, setRiderSearch] = useState('')
  const [filterError, setFilterError] = useState<string | null>(null)
  const [request, setRequest] = useState<ResultsFilter | null>(savedSelection?.request ?? null)
  const [selectOpen, setSelectOpen] = useState(() => savedSelection?.request == null)
  const [defaultApplyDone, setDefaultApplyDone] = useState(() => savedSelection?.request != null)
  const [savedInvalidated, setSavedInvalidated] = useState(false)
  const [collapsedClasses, setCollapsedClasses] = useState<Set<string>>(() => new Set())

  const events = useMemo(() => {
    const rows = eventsQuery.data ?? []
    if (seriesFilter === 'all') return rows
    return rows.filter((event) => event.series_id === seriesFilter)
  }, [eventsQuery.data, seriesFilter])

  const selectedEventId = events.some((event) => event.event_id === eventId)
    ? eventId
    : (events[0]?.event_id ?? null)

  const classesQuery = useEventClasses(selectedEventId)
  const ridersQuery = useEventParticipants(selectedEventId)
  const racesQuery = useEventRaces(selectedEventId)
  const resultsQuery = useEventResults(request)

  useEffect(() => {
    setCollapsedClasses(new Set())
  }, [request?.eventId, request?.className, request?.participantId, request?.raceId])

  // Drop a race filter that points at a practice (or otherwise missing) race.
  useEffect(() => {
    if (!racesQuery.isSuccess) return
    const races = racesQuery.data ?? []
    const raceMissing =
      (raceId !== '' && !races.some((race) => race.race_id === raceId)) ||
      (request?.raceId != null && !races.some((race) => race.race_id === request.raceId))
    if (!raceMissing) return
    setRaceId('')
    if (request?.raceId != null) {
      setRequest(null)
      setSelectOpen(true)
      clearResultsSelection()
    }
  }, [racesQuery.isSuccess, racesQuery.data, raceId, request?.raceId])

  if (!context) return <Navigate to="/?needCode=1" replace />

  // Drop a stored selection whose event is no longer available in this org.
  if (
    !savedInvalidated &&
    savedSelection &&
    eventsQuery.isSuccess &&
    !(eventsQuery.data ?? []).some((event) => event.event_id === savedSelection.eventId)
  ) {
    clearResultsSelection()
    setSavedInvalidated(true)
    setRequest(null)
    setDefaultApplyDone(false)
    setSelectOpen(true)
  }

  if (!defaultApplyDone && loadResultsSelection() == null) {
    const current =
      selectedParticipant && selectedParticipant.eventId === context.eventId ? selectedParticipant : null
    if (current) {
      setDefaultApplyDone(true)
      applyParticipantDefault(current.participantId, current.eventId, {
        setMode,
        setClassName,
        setEventId,
        setParticipantId,
        setRaceId,
        setRequest,
        setSelectOpen,
      })
    } else {
      setDefaultApplyDone(true)
      setSelectOpen(true)
    }
  }

  const needle = riderSearch.trim().toLowerCase()
  const matchingRiders = (ridersQuery.data ?? []).filter((rider) => {
    if (!needle) return true
    return `${rider.first_name} ${rider.last_name} ${rider.participant_plate ?? ''}`.toLowerCase().includes(needle)
  })
  const participantSelectExpanded = needle.length > 0
  const participantSelectSize = participantSelectExpanded
    ? Math.min(Math.max(matchingRiders.length, 1), 10)
    : 1

  function onSeriesChange(value: string) {
    const next = value === 'all' ? 'all' : Number(value)
    setSeriesFilter(next)
    setRequest(null)
    const pool =
      next === 'all' ? (eventsQuery.data ?? []) : (eventsQuery.data ?? []).filter((event) => event.series_id === next)
    const stillThere = pool.some((event) => event.event_id === selectedEventId)
    if (!stillThere) {
      const preferred = pool.find((event) => event.event_id === context?.eventId) ?? pool[0]
      setEventId(preferred?.event_id ?? null)
    }
  }

  function onRiderSearchChange(value: string) {
    setRiderSearch(value)
    const nextNeedle = value.trim().toLowerCase()
    const matches = (ridersQuery.data ?? []).filter((rider) => {
      if (!nextNeedle) return true
      return `${rider.first_name} ${rider.last_name} ${rider.participant_plate ?? ''}`.toLowerCase().includes(nextNeedle)
    })
    if (matches.length === 1) {
      setParticipantId(matches[0].participant_id)
      return
    }
    if (participantId !== '' && !matches.some((rider) => rider.participant_id === participantId)) {
      setParticipantId('')
    }
  }

  function showResults() {
    if (selectedEventId == null) {
      setFilterError('Pick an event.')
      return
    }
    if (mode === 'class' && !className) {
      setFilterError('Choose a class.')
      return
    }
    if (mode === 'race' && raceId === '') {
      setFilterError('Choose a race.')
      return
    }
    let resolvedParticipantId = participantId
    if (mode === 'participant') {
      if (resolvedParticipantId === '' && matchingRiders.length === 1) {
        resolvedParticipantId = matchingRiders[0].participant_id
        setParticipantId(resolvedParticipantId)
      }
      if (resolvedParticipantId === '') {
        setFilterError('Choose a rider.')
        return
      }
    }
    const nextRequest: ResultsFilter = {
      eventId: selectedEventId,
      className: mode === 'class' ? className : null,
      participantId: mode === 'participant' ? Number(resolvedParticipantId) : null,
      raceId: mode === 'race' ? Number(raceId) : null,
    }
    const nextSelection: StoredResultsSelection = {
      seriesFilter,
      eventId: selectedEventId,
      mode,
      className: mode === 'class' ? className : '',
      participantId: mode === 'participant' ? Number(resolvedParticipantId) : '',
      raceId: mode === 'race' ? Number(raceId) : '',
      request: nextRequest,
    }
    setFilterError(null)
    setRequest(nextRequest)
    saveResultsSelection(nextSelection)
    setSelectOpen(false)
  }

  function toggleClassTable(name: string) {
    setCollapsedClasses((current) => {
      const next = new Set(current)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const rows = resultsQuery.data?.rows ?? []
  const maxMotoByClass = resultsQuery.data?.maxMotoByClass ?? {}
  const classGroups = groupResultsByClass(rows)
  const collapsibleClasses = classGroups.length > 1
  const loading = seriesQuery.isLoading || eventsQuery.isLoading
  const loadError = seriesQuery.error ?? eventsQuery.error
  // Highlight the results-filter participant when set; otherwise the page participant in class views.
  const highlightParticipantId =
    request?.participantId ??
    (selectedParticipant && request && selectedParticipant.eventId === request.eventId
      ? selectedParticipant.participantId
      : null)

  let selectedResultsLabel: string | null = null
  if (request?.className) {
    selectedResultsLabel = request.className
  } else if (request?.participantId != null) {
    const rider =
      (ridersQuery.data ?? []).find((row) => row.participant_id === request.participantId) ??
      rows.find((row) => row.participant_id === request.participantId)
    if (rider) {
      selectedResultsLabel =
        riderName(rider.first_name, rider.last_name) +
        (rider.participant_plate ? ` · ${rider.participant_plate}` : '')
    } else if (selectedParticipant?.participantId === request.participantId) {
      selectedResultsLabel =
        riderName(selectedParticipant.firstName, selectedParticipant.lastName) +
        (selectedParticipant.participantPlate ? ` · ${selectedParticipant.participantPlate}` : '')
    }
  } else if (request?.raceId != null) {
    const race = (racesQuery.data ?? []).find((row) => row.race_id === request.raceId)
    selectedResultsLabel = race ? raceOptionLabel(race) : `Race ${request.raceId}`
  }

  return (
    <div className="space-y-6">
      <EventParticipantHeader
        eventId={context.eventId}
        eventName={context.eventName}
        pageTitle="Completed Race Results"
        onParticipantChanged={() => {
          const saved = loadResultsSelection()
          // Selecting a participant in the picker also updates Results selection.
          if (saved?.mode === 'participant' && saved.request.participantId != null) {
            setSeriesFilter(saved.seriesFilter)
            setEventId(saved.eventId)
            setMode('participant')
            setClassName('')
            setParticipantId(saved.participantId)
            setRaceId('')
            setRequest(saved.request)
            setSelectOpen(false)
            setDefaultApplyDone(true)
            return
          }
          if (saved == null) setDefaultApplyDone(false)
        }}
      />
      {loading ? <Skeleton rows={4} /> : null}
      {loadError ? (
        <div className="panel" role="alert">
          <p>{loadError instanceof Error ? loadError.message : 'Could not load events.'}</p>
          <button
            type="button"
            className="btn mt-4"
            title="Retry loading events"
            onClick={() => {
              void seriesQuery.refetch()
              void eventsQuery.refetch()
            }}
          >
            Retry
          </button>
        </div>
      ) : null}

      {!loading && !loadError ? (
        <section className={`panel !bg-[#2a2a2a] ${selectOpen ? '!py-2' : '!py-1.5'}`}>
          <div
            role="button"
            tabIndex={0}
            className="flex min-h-0 w-full cursor-pointer items-center gap-3 py-0.5"
            aria-expanded={selectOpen}
            aria-controls="completed-races-select"
            title={selectOpen ? 'Hide results filter' : 'Change results selection'}
            onClick={() => setSelectOpen((open) => !open)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setSelectOpen((open) => !open)
              }
            }}
          >
            <span className="min-w-0 flex-1 truncate text-base font-bold">
              Selected Results:{' '}
              {selectedResultsLabel ? (
                <span className="font-bold text-[#22a05a]">{selectedResultsLabel}</span>
              ) : null}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-2">
              <span className="text-base font-normal text-[#f0d56a] underline underline-offset-2">
                {selectOpen ? 'Hide' : 'Change Selection'}
              </span>
              <span className="text-base leading-none text-[#f5c518]" aria-hidden="true">
                {selectOpen ? '▲' : '▼'}
              </span>
            </span>
          </div>

          {selectOpen ? (
            <form
              id="completed-races-select"
              className="mt-2 grid gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                showResults()
              }}
            >
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="shrink-0 text-sm uppercase tracking-wide text-zinc-400">Organization</span>
                <span className="text-base font-semibold">{context.organizationName}</span>
              </p>
              <label className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm uppercase tracking-wide text-zinc-400">
                <span className="shrink-0">Series</span>
                <select
                  className="control min-w-0 flex-1"
                  title="Filter events by series"
                  value={seriesFilter === 'all' ? 'all' : String(seriesFilter)}
                  onChange={(event) => onSeriesChange(event.target.value)}
                >
                  <option value="all">All series</option>
                  {(seriesQuery.data ?? []).map((series) => (
                    <option key={series.series_id} value={series.series_id}>
                      {series.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm uppercase tracking-wide text-zinc-400">
                <span className="shrink-0">Event</span>
                <select
                  className="control min-w-0 flex-1"
                  title="Choose which event’s results to show"
                  value={selectedEventId ?? ''}
                  onChange={(event) => {
                    setEventId(Number(event.target.value))
                    setClassName('')
                    setParticipantId('')
                    setRaceId('')
                    setRequest(null)
                  }}
                >
                  {events.length === 0 ? <option value="">No events</option> : null}
                  {events.map((event) => (
                    <option key={event.event_id} value={event.event_id}>
                      {event.name}
                      {formatEventDate(event.date) ? ` · ${formatEventDate(event.date)}` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <div
                className="flex flex-wrap items-center gap-x-4 gap-y-1"
                role="radiogroup"
                aria-label="Filter by"
              >
                <span className="shrink-0 text-sm uppercase tracking-wide text-zinc-400">Filter by</span>
                <label className="inline-flex items-center gap-2" title="Filter results by class">
                  <input
                    type="radio"
                    name="result-mode"
                    checked={mode === 'class'}
                    onChange={() => {
                      setMode('class')
                      setRequest(null)
                    }}
                  />
                  Class
                </label>
                <label className="inline-flex items-center gap-2" title="Filter results by rider">
                  <input
                    type="radio"
                    name="result-mode"
                    checked={mode === 'participant'}
                    onChange={() => {
                      setMode('participant')
                      setRequest(null)
                    }}
                  />
                  Rider
                </label>
                <label className="inline-flex items-center gap-2" title="Filter results by race">
                  <input
                    type="radio"
                    name="result-mode"
                    checked={mode === 'race'}
                    onChange={() => {
                      setMode('race')
                      setRequest(null)
                    }}
                  />
                  Race
                </label>
              </div>

              {mode === 'class' ? (
                <label className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm uppercase tracking-wide text-zinc-400">
                  <span className="shrink-0">Class</span>
                  <select
                    className="control min-w-0 flex-1"
                    title="Choose a class"
                    value={className}
                    onChange={(event) => setClassName(event.target.value)}
                  >
                    <option value="">Select a class</option>
                    {(classesQuery.data ?? []).map((row) => (
                      <option key={row.class_id} value={row.class_name}>
                        {row.class_name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : mode === 'participant' ? (
                <div className="grid gap-2">
                  <label className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm uppercase tracking-wide text-zinc-400">
                    <span className="shrink-0">Search name or plate</span>
                    <input
                      className="control min-w-0 flex-1"
                      title="Filter riders by name or plate"
                      value={riderSearch}
                      onChange={(event) => onRiderSearchChange(event.target.value)}
                    />
                  </label>
                  <label className="flex flex-wrap items-start gap-x-3 gap-y-1 text-sm uppercase tracking-wide text-zinc-400">
                    <span className="shrink-0 pt-2">Rider</span>
                    <select
                      className="control min-w-0 flex-1"
                      title="Choose a rider"
                      size={participantSelectSize}
                      value={participantId === '' ? '' : String(participantId)}
                      onChange={(event) =>
                        setParticipantId(event.target.value ? Number(event.target.value) : '')
                      }
                    >
                      {!participantSelectExpanded ? <option value="">Select a rider</option> : null}
                      {matchingRiders.length === 0 ? (
                        <option value="" disabled>
                          No matching riders
                        </option>
                      ) : null}
                      {matchingRiders.map((rider) => (
                        <option key={rider.participant_id} value={rider.participant_id}>
                          {riderName(rider.first_name, rider.last_name)}
                          {rider.participant_plate ? ` · ${rider.participant_plate}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : (
                <label className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm uppercase tracking-wide text-zinc-400">
                  <span className="shrink-0">Race</span>
                  <select
                    className="control min-w-0 flex-1"
                    title="Choose a race"
                    value={raceId === '' ? '' : String(raceId)}
                    onChange={(event) => setRaceId(event.target.value ? Number(event.target.value) : '')}
                  >
                    <option value="">Select a race</option>
                    {(racesQuery.data ?? []).map((race) => (
                      <option key={race.race_id} value={race.race_id}>
                        {raceOptionLabel(race)}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {filterError ? (
                <p className="text-sm text-red-400" role="alert">
                  {filterError}
                </p>
              ) : null}
              <button
                type="submit"
                className="btn w-fit !min-h-9 px-3.5 py-2 text-[1.05rem]"
                title="Load results for this selection"
              >
                Show results
              </button>
            </form>
          ) : null}
        </section>
      ) : null}

      {resultsQuery.isLoading ? <Skeleton /> : null}
      {resultsQuery.error ? (
        <div className="panel" role="alert">
          <p>{resultsQuery.error instanceof Error ? resultsQuery.error.message : 'Could not load results.'}</p>
          <button
            type="button"
            className="btn mt-4"
            title="Retry loading results"
            onClick={() => void resultsQuery.refetch()}
          >
            Retry
          </button>
        </div>
      ) : null}
      {resultsQuery.isSuccess && rows.length === 0 ? <p className="panel">No results posted for this selection yet.</p> : null}
      {classGroups.length > 0 ? (
        <div className="space-y-6">
          {classGroups.map((group) => {
            const classId = group.rows[0]?.class_id
            const maxMoto = classId != null ? (maxMotoByClass[classId] ?? null) : null
            const optional = optionalColumnsFor(group.rows, maxMoto)
            const expanded = !collapsedClasses.has(group.className)
            return (
              <div key={group.className} className="space-y-2">
                {collapsibleClasses ? (
                  <button
                    type="button"
                    className="inline-flex cursor-pointer items-center gap-2 bg-transparent p-0 text-left"
                    aria-expanded={expanded}
                    title={expanded ? `Hide ${group.className}` : `Show ${group.className}`}
                    onClick={() => toggleClassTable(group.className)}
                  >
                    <span className="font-display text-xl font-bold uppercase text-[#f0d56a] underline underline-offset-2">
                      {group.className}
                    </span>
                    <span className="text-base leading-none text-[#f5c518]" aria-hidden="true">
                      {expanded ? '▲' : '▼'}
                    </span>
                  </button>
                ) : (
                  <h2 className="font-display text-xl font-bold uppercase">{group.className}</h2>
                )}
                {expanded ? (
                  <div className="table-wrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Place</th>
                          <th>Plate</th>
                          <th>Name</th>
                          {optional.map((column) => (
                            <th key={column.key}>{column.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row) => {
                          const isSelectedParticipant = highlightParticipantId === row.participant_id
                          return (
                            <tr
                              key={`${row.class_id}-${row.participant_id}`}
                              className={isSelectedParticipant ? 'is-selected' : undefined}
                            >
                              <td>{cell(row.overall_place)}</td>
                              <td>{cell(row.participant_plate)}</td>
                              <td>{riderName(row.first_name, row.last_name)}</td>
                              {optional.map((column) => (
                                <td key={column.key}>{cell(row[column.key] as string | number | null)}</td>
                              ))}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
