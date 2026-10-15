import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Skeleton } from '../components/Skeleton'
import { useEventCode } from '../hooks/useEventCode'
import {
  useEventClasses,
  useEventParticipants,
  useEventResults,
  useOrgEvents,
  useOrgSeries,
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
  const { context } = useEventCode()
  const seriesQuery = useOrgSeries(context?.organizationId ?? null)
  const seriesIds = (seriesQuery.data ?? []).map((series) => series.series_id)
  const eventsQuery = useOrgEvents(seriesIds)
  const [seriesFilter, setSeriesFilter] = useState<number | 'all'>(context?.seriesId ?? 'all')
  const [eventId, setEventId] = useState<number | null>(context?.eventId ?? null)
  const [mode, setMode] = useState<'class' | 'participant'>('class')
  const [className, setClassName] = useState('')
  const [participantId, setParticipantId] = useState<number | ''>('')
  const [riderSearch, setRiderSearch] = useState('')
  const [filterError, setFilterError] = useState<string | null>(null)
  const [request, setRequest] = useState<ResultsFilter | null>(null)

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

  if (!context) return <Navigate to="/?needCode=1" replace />

  const riders = (ridersQuery.data ?? []).filter((rider) => {
    const needle = riderSearch.trim().toLowerCase()
    if (!needle) return true
    return `${rider.first_name} ${rider.last_name} ${rider.participant_plate ?? ''}`.toLowerCase().includes(needle)
  })

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

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl font-extrabold uppercase">Completed races</h1>
      {loading ? <Skeleton rows={4} /> : null}
      {loadError ? (
        <div className="panel" role="alert">
          <p>{loadError instanceof Error ? loadError.message : 'Could not load events.'}</p>
          <button
            type="button"
            className="btn mt-4"
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
        <form
          className="panel grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            showResults()
          }}
        >
          <div>
            <span className="text-sm uppercase tracking-wide text-zinc-400">Organization</span>
            <p className="mt-1 text-lg">{context.organizationName}</p>
          </div>
          <label className="block text-sm uppercase tracking-wide text-zinc-400">
            Series
            <select
              className="control mt-1"
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
            <label className="inline-flex min-h-11 items-center gap-2">
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
            <label className="inline-flex min-h-11 items-center gap-2">
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
              <select className="control mt-1" value={className} onChange={(event) => setClassName(event.target.value)}>
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
                <input className="control mt-1" value={riderSearch} onChange={(event) => setRiderSearch(event.target.value)} />
              </label>
              <label className="block text-sm uppercase tracking-wide text-zinc-400">
                Participant
                <select
                  className="control mt-1"
                  value={participantId}
                  onChange={(event) => setParticipantId(event.target.value ? Number(event.target.value) : '')}
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
          <button type="submit" className="btn w-fit">
            Show results
          </button>
        </form>
      ) : null}

      {resultsQuery.isLoading ? <Skeleton /> : null}
      {resultsQuery.error ? (
        <div className="panel" role="alert">
          <p>{resultsQuery.error instanceof Error ? resultsQuery.error.message : 'Could not load results.'}</p>
          <button type="button" className="btn mt-4" onClick={() => void resultsQuery.refetch()}>
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
              {rows.map((row) => (
                <tr key={`${row.class_id}-${row.participant_id}`}>
                  <td>{row.class_name}</td>
                  <td>{cell(row.overall_place)}</td>
                  <td>{cell(row.participant_plate)}</td>
                  <td>{riderName(row.first_name, row.last_name)}</td>
                  {optional.map((column) => (
                    <td key={column.key}>{cell(row[column.key] as string | number | null)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
