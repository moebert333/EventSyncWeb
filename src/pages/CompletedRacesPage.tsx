import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { EventParticipantHeader } from '../components/EventParticipantHeader'
import { Skeleton } from '../components/Skeleton'
import { useEventCode } from '../hooks/useEventCode'
import {
  useEventClasses,
  useEventParticipants,
  useEventResults,
  useOrgEvents,
  useOrgSeries,
  useParticipantEventClasses,
  type ResultsFilter,
} from '../hooks/useEventResults'
import { formatEventDate, riderName } from '../lib/format'
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

export function CompletedRacesPage() {
  const { context, selectedParticipant, setSelectedParticipant } = useEventCode()
  const seriesQuery = useOrgSeries(context?.organizationId ?? null)
  const seriesIds = (seriesQuery.data ?? []).map((series) => series.series_id)
  const eventsQuery = useOrgEvents(seriesIds)
  const [seriesFilter, setSeriesFilter] = useState<number | 'all'>(context?.seriesId ?? 'all')
  const [eventId, setEventId] = useState<number | null>(context?.eventId ?? null)
  const [mode, setMode] = useState<'class' | 'participant'>('class')
  const [className, setClassName] = useState('')
  const [participantId, setParticipantId] = useState<number | ''>(
    selectedParticipant?.eventId === context?.eventId ? (selectedParticipant?.participantId ?? '') : '',
  )
  const [riderSearch, setRiderSearch] = useState('')
  const [filterError, setFilterError] = useState<string | null>(null)
  const [request, setRequest] = useState<ResultsFilter | null>(null)
  const [selectOpen, setSelectOpen] = useState(true)
  const [autoApplyDone, setAutoApplyDone] = useState(false)

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
  const resultsQuery = useEventResults(request)
  const participantForApply =
    !autoApplyDone && selectedParticipant && context && selectedParticipant.eventId === context.eventId
      ? selectedParticipant
      : null
  const participantClassesQuery = useParticipantEventClasses(
    participantForApply?.eventId ?? null,
    participantForApply?.participantId ?? null,
  )

  if (!context) return <Navigate to="/?needCode=1" replace />

  if (!autoApplyDone) {
    if (!participantForApply && !(selectedParticipant && selectedParticipant.eventId === context.eventId)) {
      setAutoApplyDone(true)
      setSelectOpen(true)
    } else if (participantClassesQuery.isSuccess && participantForApply) {
      setAutoApplyDone(true)
      const firstClass = participantClassesQuery.data[0]
      if (firstClass) {
        setMode('class')
        setClassName(firstClass)
        setEventId(participantForApply.eventId)
        setParticipantId(participantForApply.participantId)
        setRequest({
          eventId: participantForApply.eventId,
          className: firstClass,
          participantId: null,
        })
        setSelectOpen(false)
      } else {
        setSelectOpen(true)
      }
    } else if (participantClassesQuery.isError) {
      setAutoApplyDone(true)
      setSelectOpen(true)
    }
  }

  const riders = (ridersQuery.data ?? []).filter((rider) => {
    if (participantId !== '' && rider.participant_id === participantId) return true
    const needle = riderSearch.trim().toLowerCase()
    if (!needle) return true
    return `${rider.first_name} ${rider.last_name} ${rider.participant_plate ?? ''}`.toLowerCase().includes(needle)
  })

  function chooseParticipant(nextId: number | '') {
    setParticipantId(nextId)
    if (nextId === '' || selectedEventId == null) {
      setSelectedParticipant(null)
      return
    }
    const rider = (ridersQuery.data ?? []).find((row) => row.participant_id === nextId)
    if (!rider) {
      setSelectedParticipant(null)
      return
    }
    setSelectedParticipant({
      eventId: selectedEventId,
      participantId: rider.participant_id,
      firstName: rider.first_name,
      lastName: rider.last_name,
      participantPlate: rider.participant_plate,
    })
  }

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

  function showResults() {
    if (selectedEventId == null) {
      setFilterError('Pick an event.')
      return
    }
    if (mode === 'class' && !className) {
      setFilterError('Choose a class.')
      return
    }
    if (mode === 'participant' && participantId === '') {
      setFilterError('Choose a rider.')
      return
    }
    setFilterError(null)
    setRequest({
      eventId: selectedEventId,
      className: mode === 'class' ? className : null,
      participantId: mode === 'participant' ? Number(participantId) : null,
    })
    setSelectOpen(false)
  }

  const rows = resultsQuery.data ?? []
  const optional = OPTIONAL_COLUMNS.filter((column) =>
    rows.some((row) => {
      const value = row[column.key]
      return value != null && value !== ''
    }),
  )
  const loading = seriesQuery.isLoading || eventsQuery.isLoading
  const loadError = seriesQuery.error ?? eventsQuery.error
  const waitingForAutoApply =
    !autoApplyDone &&
    Boolean(selectedParticipant && selectedParticipant.eventId === context.eventId)
  const highlightParticipantId =
    selectedParticipant && request && selectedParticipant.eventId === request.eventId
      ? selectedParticipant.participantId
      : null

  return (
    <div className="space-y-6">
      <EventParticipantHeader
        eventId={context.eventId}
        eventName={context.eventName}
        pageTitle="Completed Race Results"
        onParticipantChanged={() => setAutoApplyDone(false)}
      />
      {loading || waitingForAutoApply ? <Skeleton rows={4} /> : null}
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

      {!loading && !loadError && !waitingForAutoApply ? (
        <section className={`panel ${selectOpen ? '' : '!py-1.5'}`}>
          <button
            type="button"
            className={`flex w-full cursor-pointer items-center justify-between gap-3 bg-transparent p-0 text-left ${
              selectOpen ? 'min-h-11' : 'min-h-0 py-0.5'
            }`}
            aria-expanded={selectOpen}
            aria-controls="completed-races-select"
            title={selectOpen ? 'Collapse results filter' : 'Expand results filter'}
            onClick={() => setSelectOpen((open) => !open)}
          >
            <span className={`font-bold ${selectOpen ? 'text-lg' : 'text-base'}`}>Select Results Filter:</span>
            <span className="text-lg leading-none text-[#f5c518]" aria-hidden="true">
              {selectOpen ? '▲' : '▼'}
            </span>
          </button>

          {selectOpen ? (
            <form
              id="completed-races-select"
              className="mt-4 grid gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                showResults()
              }}
            >
              <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-sm uppercase tracking-wide text-zinc-400">Organization</span>
                <span className="text-lg">{context.organizationName}</span>
              </p>
              <label className="block text-sm uppercase tracking-wide text-zinc-400">
                Series
                <select
                  className="control mt-1"
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
              <label className="block text-sm uppercase tracking-wide text-zinc-400">
                Event
                <select
                  className="control mt-1"
                  title="Choose which event’s results to show"
                  value={selectedEventId ?? ''}
                  onChange={(event) => {
                    setEventId(Number(event.target.value))
                    setClassName('')
                    setParticipantId('')
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

              <fieldset className="flex flex-wrap gap-4">
                <legend className="text-sm uppercase tracking-wide text-zinc-400">Filter by</legend>
                <label className="inline-flex min-h-11 items-center gap-2" title="Filter results by class">
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
                <label className="inline-flex min-h-11 items-center gap-2" title="Filter results by participant">
                  <input
                    type="radio"
                    name="result-mode"
                    checked={mode === 'participant'}
                    onChange={() => {
                      setMode('participant')
                      setRequest(null)
                    }}
                  />
                  Participant
                </label>
              </fieldset>

              {mode === 'class' ? (
                <label className="block text-sm uppercase tracking-wide text-zinc-400">
                  Class
                  <select
                    className="control mt-1"
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
              ) : (
                <div className="grid gap-2">
                  <label className="block text-sm uppercase tracking-wide text-zinc-400">
                    Search name or plate
                    <input
                      className="control mt-1"
                      title="Filter riders by name or plate"
                      value={riderSearch}
                      onChange={(event) => setRiderSearch(event.target.value)}
                    />
                  </label>
                  <label className="block text-sm uppercase tracking-wide text-zinc-400">
                    Participant
                    <select
                      className="control mt-1"
                      title="Choose a rider"
                      value={participantId}
                      onChange={(event) =>
                        chooseParticipant(event.target.value ? Number(event.target.value) : '')
                      }
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
                </div>
              )}

              {filterError ? (
                <p className="text-sm text-red-400" role="alert">
                  {filterError}
                </p>
              ) : null}
              <button type="submit" className="btn w-fit" title="Load results for this selection">
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
      {rows.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Class</th>
                <th>Place</th>
                <th>Plate</th>
                <th>Name</th>
                {optional.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isSelectedParticipant = highlightParticipantId === row.participant_id
                return (
                  <tr
                    key={`${row.class_id}-${row.participant_id}`}
                    className={isSelectedParticipant ? 'is-selected' : undefined}
                  >
                    <td>{row.class_name}</td>
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
}
