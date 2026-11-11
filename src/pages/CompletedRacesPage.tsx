import { useEffect, useMemo, useState } from 'react'
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
import { useSeriesAnalyzeData } from '../hooks/useSeriesAnalyzeData'
import {
  computeStandingsByClass,
  standingsRowsForDisplay,
  type StandingRow,
} from '../lib/analyzeMetrics'
import { formatEventDate, riderName } from '../lib/format'
import { formatPlaceLabel, motoKeysUpTo } from '../lib/resultsPoints'
import {
  clearResultsSelection,
  loadResultsSelection,
  saveResultsSelection,
  type ResultsMode,
  type ResultsScope,
  type SeriesResultsRequest,
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

function isPlaceColumn(key: keyof EventClassResult): boolean {
  return key === 'overall_place' || key.endsWith('_place')
}

function fmtAvg(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
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
    setScope: (scope: ResultsScope) => void
    setMode: (mode: ResultsMode) => void
    setClassName: (name: string) => void
    setEventId: (id: number) => void
    setParticipantId: (id: number | '') => void
    setRaceId: (id: number | '') => void
    setRequest: (request: ResultsFilter | null) => void
    setSeriesRequest: (request: SeriesResultsRequest | null) => void
    setSelectOpen: (open: boolean) => void
  },
) {
  setters.setScope('event')
  setters.setMode('participant')
  setters.setClassName('')
  setters.setEventId(eventId)
  setters.setParticipantId(participantId)
  setters.setRaceId('')
  setters.setSeriesRequest(null)
  setters.setRequest({
    eventId,
    className: null,
    participantId,
    raceId: null,
  })
  setters.setSelectOpen(false)
}

function StandingsTable({
  standings,
  highlightParticipantId,
}: {
  standings: StandingRow[]
  highlightParticipantId: number | null
}) {
  const scored = standingsRowsForDisplay(standings)
  if (scored.length === 0) {
    return <p className="panel">No scored series points in this class yet.</p>
  }
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Plate</th>
            <th>Name</th>
            <th>Points</th>
            <th>Events</th>
            <th>Avg</th>
          </tr>
        </thead>
        <tbody>
          {scored.map(({ row, rank }) => {
            const selected =
              highlightParticipantId != null && row.participantId === highlightParticipantId
            return (
              <tr key={row.participantId} className={selected ? 'is-selected' : undefined}>
                <td>{rank}</td>
                <td>{cell(row.plate)}</td>
                <td>{row.name}</td>
                <td>{row.points}</td>
                <td>{row.events}</td>
                <td>{fmtAvg(row.avgPlace)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function CompletedRacesPage() {
  const { context, selectedParticipant } = useEventCode()
  const savedSelection = useMemo(() => loadResultsSelection(), [])
  const seriesQuery = useOrgSeries(context?.organizationId ?? null)
  const seriesIds = (seriesQuery.data ?? []).map((series) => series.series_id)
  const eventsQuery = useOrgEvents(seriesIds)

  const [scope, setScope] = useState<ResultsScope>(savedSelection?.scope ?? 'event')
  const [seriesFilter, setSeriesFilter] = useState<number | 'all'>(() => {
    if (savedSelection?.scope === 'series' && typeof savedSelection.seriesFilter === 'number') {
      return savedSelection.seriesFilter
    }
    return context?.seriesId ?? savedSelection?.seriesFilter ?? 'all'
  })
  const [eventId, setEventId] = useState<number | null>(() => {
    if (context?.seriesId != null && context.eventId != null) return context.eventId
    return savedSelection?.eventId ?? context?.eventId ?? null
  })
  const [mode, setMode] = useState<ResultsMode>(() => {
    const savedMode = savedSelection?.mode ?? 'class'
    if ((savedSelection?.scope ?? 'event') === 'series' && savedMode === 'race') return 'class'
    return savedMode
  })
  const [className, setClassName] = useState(savedSelection?.className ?? '')
  const [participantId, setParticipantId] = useState<number | ''>(savedSelection?.participantId ?? '')
  const [raceId, setRaceId] = useState<number | ''>(savedSelection?.raceId ?? '')
  const [riderSearch, setRiderSearch] = useState('')
  const [filterError, setFilterError] = useState<string | null>(null)
  const [request, setRequest] = useState<ResultsFilter | null>(
    savedSelection?.scope === 'series' ? null : (savedSelection?.request ?? null),
  )
  const [seriesRequest, setSeriesRequest] = useState<SeriesResultsRequest | null>(
    savedSelection?.scope === 'series' ? savedSelection.seriesRequest : null,
  )
  const [selectOpen, setSelectOpen] = useState(
    () =>
      savedSelection == null ||
      (savedSelection.scope === 'series'
        ? savedSelection.seriesRequest == null
        : savedSelection.request == null),
  )
  const [defaultApplyDone, setDefaultApplyDone] = useState(
    () =>
      savedSelection != null &&
      (savedSelection.scope === 'series'
        ? savedSelection.seriesRequest != null
        : savedSelection.request != null),
  )
  const [savedInvalidated, setSavedInvalidated] = useState(false)
  const [collapsedClasses, setCollapsedClasses] = useState<Set<string>>(() => new Set())

  const events = useMemo(() => {
    const rows = eventsQuery.data ?? []
    if (seriesFilter === 'all') return rows
    return rows.filter((event) => event.series_id === seriesFilter)
  }, [eventsQuery.data, seriesFilter])

  const selectedEventId = events.some((event) => event.event_id === eventId)
    ? eventId
    : (events.find((event) => event.event_id === context?.eventId)?.event_id ??
      events[0]?.event_id ??
      null)

  const seriesIdForStandings =
    scope === 'series' && typeof seriesFilter === 'number' ? seriesFilter : null
  const seriesAnalyzeQuery = useSeriesAnalyzeData(seriesIdForStandings)

  const classesQuery = useEventClasses(scope === 'event' ? selectedEventId : null)
  const ridersQuery = useEventParticipants(scope === 'event' ? selectedEventId : null)
  const racesQuery = useEventRaces(scope === 'event' ? selectedEventId : null)
  const resultsQuery = useEventResults(scope === 'event' ? request : null)

  const seriesClassNames = useMemo(() => {
    const rows = seriesAnalyzeQuery.data?.rows ?? []
    return [...new Set(rows.map((row) => row.class_name))].sort((a, b) => a.localeCompare(b))
  }, [seriesAnalyzeQuery.data?.rows])

  const seriesRiders = seriesAnalyzeQuery.data?.riders ?? []

  const standingsHighlightId =
    seriesRequest?.participantId ??
    (selectedParticipant && selectedParticipant.eventId === context?.eventId
      ? selectedParticipant.participantId
      : null)

  const standingsByClass = useMemo(() => {
    const payload = seriesAnalyzeQuery.data
    if (!payload || seriesRequest == null) return {}
    return computeStandingsByClass(payload.events, payload.rows, standingsHighlightId)
  }, [seriesAnalyzeQuery.data, seriesRequest, standingsHighlightId])

  useEffect(() => {
    setCollapsedClasses(new Set())
  }, [
    request?.eventId,
    request?.className,
    request?.participantId,
    request?.raceId,
    seriesRequest?.seriesId,
    seriesRequest?.className,
    seriesRequest?.participantId,
  ])

  // Drop a race filter that points at a practice (or otherwise missing) race.
  useEffect(() => {
    if (scope !== 'event') return
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
  }, [scope, racesQuery.isSuccess, racesQuery.data, raceId, request?.raceId])

  if (!context) return null
  const eventContext = context

  // Drop a stored selection that no longer matches available series/events.
  if (!savedInvalidated && savedSelection && eventsQuery.isSuccess && seriesQuery.isSuccess) {
    const eventMissing =
      savedSelection.scope !== 'series' &&
      !(eventsQuery.data ?? []).some((event) => event.event_id === savedSelection.eventId)
    const seriesMissing =
      savedSelection.scope === 'series' &&
      (typeof savedSelection.seriesFilter !== 'number' ||
        !(seriesQuery.data ?? []).some((series) => series.series_id === savedSelection.seriesFilter))
    if (eventMissing || seriesMissing) {
      clearResultsSelection()
      setSavedInvalidated(true)
      setRequest(null)
      setSeriesRequest(null)
      setDefaultApplyDone(false)
      setSelectOpen(true)
    }
  }

  if (!defaultApplyDone && loadResultsSelection() == null) {
    const current =
      selectedParticipant && selectedParticipant.eventId === eventContext.eventId
        ? selectedParticipant
        : null
    if (current) {
      setDefaultApplyDone(true)
      setSeriesFilter(eventContext.seriesId)
      applyParticipantDefault(current.participantId, current.eventId, {
        setScope,
        setMode,
        setClassName,
        setEventId,
        setParticipantId,
        setRaceId,
        setRequest,
        setSeriesRequest,
        setSelectOpen,
      })
    } else {
      setDefaultApplyDone(true)
      setSeriesFilter(eventContext.seriesId)
      setSelectOpen(true)
    }
  }

  const needle = riderSearch.trim().toLowerCase()
  const riderSource = scope === 'series' ? seriesRiders : (ridersQuery.data ?? [])
  const matchingRiders = riderSource.filter((rider) => {
    if (!needle) return true
    return `${rider.first_name} ${rider.last_name} ${rider.participant_plate ?? ''}`.toLowerCase().includes(needle)
  })
  const participantSelectExpanded = needle.length > 0
  const participantSelectSize = participantSelectExpanded
    ? Math.min(Math.max(matchingRiders.length, 1), 10)
    : 1

  function onScopeChange(next: ResultsScope) {
    setScope(next)
    setRequest(null)
    setSeriesRequest(null)
    setFilterError(null)
    setRaceId('')
    if (next === 'series') {
      if (seriesFilter === 'all') setSeriesFilter(eventContext.seriesId)
      if (mode === 'race') setMode('class')
    }
  }

  function onSeriesChange(value: string) {
    const next = value === 'all' ? 'all' : Number(value)
    if (scope === 'series' && next === 'all') {
      setFilterError('Choose a series for standings.')
      return
    }
    setSeriesFilter(next)
    setRequest(null)
    setSeriesRequest(null)
    setClassName('')
    setParticipantId('')
    setRaceId('')
    const pool =
      next === 'all' ? (eventsQuery.data ?? []) : (eventsQuery.data ?? []).filter((event) => event.series_id === next)
    const stillThere = pool.some((event) => event.event_id === selectedEventId)
    if (!stillThere) {
      const preferred = pool.find((event) => event.event_id === eventContext.eventId) ?? pool[0]
      setEventId(preferred?.event_id ?? null)
    }
  }

  function onRiderSearchChange(value: string) {
    setRiderSearch(value)
    const nextNeedle = value.trim().toLowerCase()
    const matches = riderSource.filter((rider) => {
      if (!nextNeedle) return true
      return `${rider.first_name} ${rider.last_name} ${rider.participant_plate ?? ''}`.toLowerCase().includes(nextNeedle)
    })
    if (matches.length === 1) {
      setParticipantId(matches[0]!.participant_id)
      return
    }
    if (participantId !== '' && !matches.some((rider) => rider.participant_id === participantId)) {
      setParticipantId('')
    }
  }

  function showResults(overrides?: {
    className?: string
    participantId?: number | ''
    raceId?: number | ''
  }) {
    const nextClassName = overrides?.className ?? className
    let resolvedParticipantId = overrides?.participantId ?? participantId
    const nextRaceId = overrides?.raceId ?? raceId

    if (scope === 'series') {
      if (typeof seriesFilter !== 'number') {
        setFilterError('Choose a series.')
        return
      }
      if (mode === 'class' && !nextClassName) {
        setFilterError('Choose a class.')
        return
      }
      if (mode === 'participant') {
        if (resolvedParticipantId === '' && matchingRiders.length === 1) {
          resolvedParticipantId = matchingRiders[0]!.participant_id
          setParticipantId(resolvedParticipantId)
        }
        if (resolvedParticipantId === '') {
          setFilterError('Choose a rider.')
          return
        }
      }
      const seriesMode: ResultsMode = mode === 'participant' ? 'participant' : 'class'
      const nextSeriesRequest: SeriesResultsRequest = {
        seriesId: seriesFilter,
        className: seriesMode === 'class' ? nextClassName : null,
        participantId: seriesMode === 'participant' ? Number(resolvedParticipantId) : null,
      }
      const nextSelection: StoredResultsSelection = {
        scope: 'series',
        seriesFilter,
        eventId: selectedEventId ?? eventContext.eventId,
        mode: seriesMode,
        className: seriesMode === 'class' ? nextClassName : '',
        participantId: seriesMode === 'participant' ? Number(resolvedParticipantId) : '',
        raceId: '',
        request: null,
        seriesRequest: nextSeriesRequest,
      }
      setFilterError(null)
      setRequest(null)
      setSeriesRequest(nextSeriesRequest)
      saveResultsSelection(nextSelection)
      setSelectOpen(false)
      return
    }

    if (selectedEventId == null) {
      setFilterError('Pick an event.')
      return
    }
    if (mode === 'class' && !nextClassName) {
      setFilterError('Choose a class.')
      return
    }
    if (mode === 'race' && nextRaceId === '') {
      setFilterError('Choose a race.')
      return
    }
    if (mode === 'participant') {
      if (resolvedParticipantId === '' && matchingRiders.length === 1) {
        resolvedParticipantId = matchingRiders[0]!.participant_id
        setParticipantId(resolvedParticipantId)
      }
      if (resolvedParticipantId === '') {
        setFilterError('Choose a rider.')
        return
      }
    }
    const nextRequest: ResultsFilter = {
      eventId: selectedEventId,
      className: mode === 'class' ? nextClassName : null,
      participantId: mode === 'participant' ? Number(resolvedParticipantId) : null,
      raceId: mode === 'race' ? Number(nextRaceId) : null,
    }
    const nextSelection: StoredResultsSelection = {
      scope: 'event',
      seriesFilter,
      eventId: selectedEventId,
      mode,
      className: mode === 'class' ? nextClassName : '',
      participantId: mode === 'participant' ? Number(resolvedParticipantId) : '',
      raceId: mode === 'race' ? Number(nextRaceId) : '',
      request: nextRequest,
      seriesRequest: null,
    }
    setFilterError(null)
    setSeriesRequest(null)
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
  const statusByPosition = resultsQuery.data?.statusByPosition ?? {}
  const classGroups = groupResultsByClass(rows)
  const collapsibleClasses = classGroups.length > 1
  const loading = seriesQuery.isLoading || eventsQuery.isLoading
  const loadError = seriesQuery.error ?? eventsQuery.error

  const highlightParticipantId =
    request?.participantId ??
    (selectedParticipant && request && selectedParticipant.eventId === request.eventId
      ? selectedParticipant.participantId
      : null)

  let selectedResultsLabel: string | null = null
  if (scope === 'series' && seriesRequest) {
    if (seriesRequest.className) {
      selectedResultsLabel = seriesRequest.className
    } else if (seriesRequest.participantId != null) {
      const rider =
        seriesRiders.find((row) => row.participant_id === seriesRequest.participantId) ??
        (selectedParticipant?.participantId === seriesRequest.participantId
          ? {
              first_name: selectedParticipant.firstName,
              last_name: selectedParticipant.lastName,
              participant_plate: selectedParticipant.participantPlate,
            }
          : null)
      if (rider) {
        selectedResultsLabel =
          riderName(rider.first_name, rider.last_name) +
          (rider.participant_plate ? ` · ${rider.participant_plate}` : '')
      }
    }
  } else if (request?.className) {
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

  const seriesRiderClassGroups =
    seriesRequest?.participantId != null
      ? Object.entries(standingsByClass)
          .filter(([, standings]) =>
            standings.some(
              (row) => row.participantId === seriesRequest.participantId && row.points > 0,
            ),
          )
          .map(([name, standings]) => ({ className: name, standings }))
      : []

  return (
    <div className="space-y-6">
      <EventParticipantHeader
        eventId={context.eventId}
        eventName={context.eventName}
        pageTitle="Event Results"
        onParticipantChanged={() => {
          const saved = loadResultsSelection()
          // Selecting a participant in the picker also updates Results selection (event scope).
          if (
            saved?.scope === 'event' &&
            saved.mode === 'participant' &&
            saved.request?.participantId != null
          ) {
            setScope('event')
            setSeriesFilter(saved.seriesFilter === 'all' ? context.seriesId : saved.seriesFilter)
            setEventId(saved.eventId)
            setMode('participant')
            setClassName('')
            setParticipantId(saved.participantId)
            setRaceId('')
            setSeriesRequest(null)
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
        <section
          className={`panel !bg-[#2a2a2a] !px-3 ${selectOpen ? '!py-2' : '!py-1.5'}`}
        >
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
              {scope === 'series' && seriesRequest ? 'Series Standings:' : 'Selected Results:'}{' '}
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

              <div
                className="flex flex-wrap items-center gap-x-2 gap-y-1"
                role="radiogroup"
                aria-label="Show"
              >
                <span className="shrink-0 text-sm uppercase tracking-wide text-zinc-400">Show</span>
                <label className="inline-flex items-center gap-1.5" title="Show single-event results">
                  <input
                    type="radio"
                    name="results-scope"
                    checked={scope === 'event'}
                    onChange={() => onScopeChange('event')}
                  />
                  Event results
                </label>
                <label
                  className="inline-flex items-center gap-1.5"
                  title="Show series championship standings"
                >
                  <input
                    type="radio"
                    name="results-scope"
                    checked={scope === 'series'}
                    onChange={() => onScopeChange('series')}
                  />
                  Series standings
                </label>
              </div>

              <label className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm uppercase tracking-wide text-zinc-400">
                <span className="shrink-0">Series</span>
                <select
                  className="control min-w-0 flex-1"
                  title={
                    scope === 'series'
                      ? 'Choose which series standings to show'
                      : 'Filter events by series'
                  }
                  value={seriesFilter === 'all' ? 'all' : String(seriesFilter)}
                  onChange={(event) => onSeriesChange(event.target.value)}
                >
                  {scope === 'event' ? <option value="all">All series</option> : null}
                  {(seriesQuery.data ?? []).map((series) => (
                    <option key={series.series_id} value={series.series_id}>
                      {series.name}
                    </option>
                  ))}
                </select>
              </label>

              {scope === 'event' ? (
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
              ) : null}

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
                      setSeriesRequest(null)
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
                      setSeriesRequest(null)
                      // Seed with the Event Code rider when switching into Rider filter.
                      if (
                        selectedParticipant &&
                        (scope === 'series' ||
                          selectedParticipant.eventId === selectedEventId ||
                          selectedParticipant.eventId === eventContext.eventId)
                      ) {
                        setParticipantId(selectedParticipant.participantId)
                      }
                    }}
                  />
                  Rider
                </label>
                {scope === 'event' ? (
                  <label className="inline-flex items-center gap-2" title="Filter results by race">
                    <input
                      type="radio"
                      name="result-mode"
                      checked={mode === 'race'}
                      onChange={() => {
                        setMode('race')
                        setRequest(null)
                        setSeriesRequest(null)
                      }}
                    />
                    Race
                  </label>
                ) : null}
              </div>

              {mode === 'class' ? (
                <label className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm uppercase tracking-wide text-zinc-400">
                  <span className="shrink-0">Class</span>
                  <select
                    className="control min-w-0 flex-1"
                    title="Choose a class"
                    value={className}
                    onChange={(event) => {
                      const next = event.target.value
                      setClassName(next)
                      if (next) showResults({ className: next })
                    }}
                  >
                    <option value="">Select a class</option>
                    {scope === 'series'
                      ? seriesClassNames.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))
                      : (classesQuery.data ?? []).map((row) => (
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
                      onChange={(event) => {
                        const next = event.target.value ? Number(event.target.value) : ''
                        setParticipantId(next)
                        if (next !== '') showResults({ participantId: next })
                      }}
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
                    onChange={(event) => {
                      const next = event.target.value ? Number(event.target.value) : ''
                      setRaceId(next)
                      if (next !== '') showResults({ raceId: next })
                    }}
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

      {scope === 'event' ? (
        <>
          {resultsQuery.isLoading ? <Skeleton /> : null}
          {resultsQuery.error ? (
            <div className="panel" role="alert">
              <p>
                {resultsQuery.error instanceof Error
                  ? resultsQuery.error.message
                  : 'Could not load results.'}
              </p>
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
          {resultsQuery.isSuccess && rows.length === 0 ? (
            <p className="panel">No results posted for this selection yet.</p>
          ) : null}
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
                              const isSelectedParticipant =
                                highlightParticipantId === row.participant_id
                              return (
                                <tr
                                  key={`${row.class_id}-${row.participant_id}`}
                                  className={isSelectedParticipant ? 'is-selected' : undefined}
                                >
                                  <td>{formatPlaceLabel(row.overall_place, statusByPosition)}</td>
                                  <td>{cell(row.participant_plate)}</td>
                                  <td>{riderName(row.first_name, row.last_name)}</td>
                                  {optional.map((column) => (
                                    <td key={column.key}>
                                      {isPlaceColumn(column.key)
                                        ? formatPlaceLabel(
                                            row[column.key] as string | number | null,
                                            statusByPosition,
                                          )
                                        : cell(row[column.key] as string | number | null)}
                                    </td>
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
        </>
      ) : null}

      {scope === 'series' && seriesRequest ? (
        <>
          {seriesAnalyzeQuery.isLoading ? <Skeleton /> : null}
          {seriesAnalyzeQuery.error ? (
            <div className="panel" role="alert">
              <p>
                {seriesAnalyzeQuery.error instanceof Error
                  ? seriesAnalyzeQuery.error.message
                  : 'Could not load series standings.'}
              </p>
              <button
                type="button"
                className="btn mt-4"
                title="Retry loading series standings"
                onClick={() => void seriesAnalyzeQuery.refetch()}
              >
                Retry
              </button>
            </div>
          ) : null}
          {seriesAnalyzeQuery.isSuccess && seriesRequest.className ? (
            <div className="space-y-2">
              <h2 className="font-display text-xl font-bold uppercase">{seriesRequest.className}</h2>
              <StandingsTable
                standings={standingsByClass[seriesRequest.className] ?? []}
                highlightParticipantId={standingsHighlightId}
              />
            </div>
          ) : null}
          {seriesAnalyzeQuery.isSuccess && seriesRequest.participantId != null ? (
            seriesRiderClassGroups.length === 0 ? (
              <p className="panel">No scored series points for this rider yet.</p>
            ) : (
              <div className="space-y-6">
                {seriesRiderClassGroups.map((group) => {
                  const expanded = !collapsedClasses.has(group.className)
                  const multi = seriesRiderClassGroups.length > 1
                  return (
                    <div key={group.className} className="space-y-2">
                      {multi ? (
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
                      {expanded || !multi ? (
                        <StandingsTable
                          standings={group.standings}
                          highlightParticipantId={seriesRequest.participantId}
                        />
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )
          ) : null}
        </>
      ) : null}
    </div>
  )
}
