import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEventCode } from '../../hooks/useEventCode'
import { riderName } from '../../lib/format'
import { saveParticipantAsResultsSelection } from '../../lib/resultsSelection'
import type { EntryParticipant, Series } from '../../types/database'

type Props = {
  seriesList: Series[]
  seriesId: number | null
  onSeriesChange: (seriesId: number) => void
  riders: EntryParticipant[]
  riderClassNames: string[]
  className: string | null
  onClassChange: (className: string) => void
  summary: {
    seriesRank: number | null
    seriesPoints: number
    eventsRaced: number
    eventsInSeries: number
    gapToLeader: number | null
  }
  seriesName: string
}

const LINK_MAX = 15

function shortLinkLabel(text: string, max = LINK_MAX): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

export function AnalyzeContextHeader({
  seriesList,
  seriesId,
  onSeriesChange,
  riders,
  riderClassNames,
  className,
  onClassChange,
  summary,
  seriesName,
}: Props) {
  const { context, selectedParticipant, setSelectedParticipant } = useEventCode()
  const eventId = context?.eventId ?? null
  const [seriesOpen, setSeriesOpen] = useState(false)
  const [riderOpen, setRiderOpen] = useState(false)
  const [classOpen, setClassOpen] = useState(false)
  const [riderSearch, setRiderSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = selectedParticipant

  const participantFull = selected
    ? `${riderName(selected.firstName, selected.lastName)}${
        selected.participantPlate ? `-${selected.participantPlate}` : ''
      }`
    : 'Select rider'

  const seriesFull = seriesName || 'Select series'
  const classFull = className ?? (selected ? 'No class' : '—')

  const needle = riderSearch.trim().toLowerCase()
  const filteredRiders = useMemo(() => {
    if (!needle) return riders
    return riders.filter((rider) =>
      `${rider.first_name} ${rider.last_name} ${rider.participant_plate ?? ''}`
        .toLowerCase()
        .includes(needle),
    )
  }, [riders, needle])

  useEffect(() => {
    if (!riderOpen) return
    const id = window.requestAnimationFrame(() => {
      searchRef.current?.focus()
      searchRef.current?.select()
    })
    return () => window.cancelAnimationFrame(id)
  }, [riderOpen])

  function chooseRider(rider: EntryParticipant) {
    if (eventId == null) return
    setSelectedParticipant({
      eventId,
      participantId: rider.participant_id,
      firstName: rider.first_name,
      lastName: rider.last_name,
      participantPlate: rider.participant_plate,
    })
    saveParticipantAsResultsSelection(eventId, rider.participant_id)
    setRiderOpen(false)
    setRiderSearch('')
  }

  const seriesPicker = seriesOpen
    ? createPortal(
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-20"
          role="dialog"
          aria-modal="true"
          aria-label="Select series"
          onClick={() => setSeriesOpen(false)}
        >
          <div
            className="w-full max-w-md border border-[#f5c518] bg-[#1a1a1a] p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Select series</p>
            <ul className="mt-3 max-h-80 space-y-1 overflow-auto">
              {seriesList.map((series) => (
                <li key={series.series_id}>
                  <button
                    type="button"
                    className={`w-full px-3 py-3 text-left text-base ${
                      series.series_id === seriesId
                        ? 'bg-[#f5c518]/20 text-[#f5c518]'
                        : 'text-zinc-100 hover:bg-white/5'
                    }`}
                    onClick={() => {
                      onSeriesChange(series.series_id)
                      setSeriesOpen(false)
                    }}
                  >
                    {series.name}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn-ghost btn mt-3 w-full" onClick={() => setSeriesOpen(false)}>
              Close
            </button>
          </div>
        </div>,
        document.body,
      )
    : null

  const riderPicker = riderOpen
    ? createPortal(
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-20"
          role="dialog"
          aria-modal="true"
          aria-label="Select rider"
          onClick={() => setRiderOpen(false)}
        >
          <div
            className="grid w-full max-w-lg gap-3 border border-[#f5c518] bg-[#1a1a1a] p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Select rider</p>
            <label className="block text-sm uppercase tracking-wide text-zinc-400">
              Search name or plate
              <input
                ref={searchRef}
                className="control mt-1"
                value={riderSearch}
                onChange={(event) => setRiderSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  const first = filteredRiders[0]
                  if (first) chooseRider(first)
                }}
              />
            </label>
            <ul className="max-h-72 overflow-auto border border-white/10">
              {filteredRiders.length === 0 ? (
                <li className="px-3 py-2 text-sm text-zinc-500">No matching riders</li>
              ) : (
                filteredRiders.map((rider) => (
                  <li key={rider.participant_id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-white/5"
                      onClick={() => chooseRider(rider)}
                    >
                      {riderName(rider.first_name, rider.last_name)}
                      {rider.participant_plate ? ` · ${rider.participant_plate}` : ''}
                    </button>
                  </li>
                ))
              )}
            </ul>
            <button
              type="button"
              className="btn-ghost btn"
              onClick={() => {
                setRiderOpen(false)
                setRiderSearch('')
              }}
            >
              Close
            </button>
          </div>
        </div>,
        document.body,
      )
    : null

  const classPicker = classOpen
    ? createPortal(
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-20"
          role="dialog"
          aria-modal="true"
          aria-label="Select class"
          onClick={() => setClassOpen(false)}
        >
          <div
            className="w-full max-w-md border border-[#f5c518] bg-[#1a1a1a] p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Select class</p>
            <ul className="mt-3 max-h-80 space-y-1 overflow-auto">
              {riderClassNames.length === 0 ? (
                <li className="px-3 py-2 text-sm text-zinc-500">No classes for this rider</li>
              ) : (
                riderClassNames.map((name) => (
                  <li key={name}>
                    <button
                      type="button"
                      className={`w-full px-3 py-3 text-left text-base ${
                        name === className
                          ? 'bg-[#f5c518]/20 text-[#f5c518]'
                          : 'text-zinc-100 hover:bg-white/5'
                      }`}
                      onClick={() => {
                        onClassChange(name)
                        setClassOpen(false)
                      }}
                    >
                      {name}
                    </button>
                  </li>
                ))
              )}
            </ul>
            <button type="button" className="btn-ghost btn mt-3 w-full" onClick={() => setClassOpen(false)}>
              Close
            </button>
          </div>
        </div>,
        document.body,
      )
    : null

  const linkClass =
    'cursor-pointer text-lg font-bold text-[#f5c518] underline underline-offset-2 hover:text-[#ffe566]'

  return (
    <>
      <div className="-mx-4 -mt-6 border-b border-[#f5c518]/35 bg-[#252525] px-4 py-3 shadow-[0_1px_0_rgb(0_0_0_/_0.4)]">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-base">
          <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5">
            <span className="shrink-0 text-sm uppercase tracking-wide text-zinc-500">Series</span>
            <button
              type="button"
              className={linkClass}
              title={seriesFull}
              onClick={() => setSeriesOpen(true)}
            >
              {shortLinkLabel(seriesFull)}
            </button>
          </span>
          <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5">
            <span className="shrink-0 text-sm uppercase tracking-wide text-zinc-500">Rider</span>
            <button
              type="button"
              className={linkClass}
              title={participantFull}
              onClick={() => setRiderOpen(true)}
            >
              {shortLinkLabel(participantFull)}
            </button>
          </span>
          <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5">
            <span className="shrink-0 text-sm uppercase tracking-wide text-zinc-500">Class</span>
            <button
              type="button"
              className={`${linkClass} disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50`}
              title={classFull}
              disabled={!selected || riderClassNames.length === 0}
              onClick={() => setClassOpen(true)}
            >
              {shortLinkLabel(classFull)}
            </button>
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4">
          <div className="inline-flex w-auto items-baseline gap-2 border border-white/10 bg-[#1a1a1a] px-3 py-2">
            <span className="text-sm uppercase tracking-wide text-zinc-400">Standing</span>
            <span className="font-display text-2xl font-bold leading-none text-white">
              {summary.seriesRank != null ? `${summary.seriesRank}` : '—'}
            </span>
          </div>
          <div className="inline-flex w-auto items-baseline gap-2 border border-white/10 bg-[#1a1a1a] px-3 py-2">
            <span className="text-sm uppercase tracking-wide text-zinc-400">Points</span>
            <span className="font-display text-2xl font-bold leading-none text-white">
              {summary.seriesPoints}
            </span>
          </div>
          <div className="inline-flex w-auto items-baseline gap-2 border border-white/10 bg-[#1a1a1a] px-3 py-2">
            <span className="text-sm uppercase tracking-wide text-zinc-400">Events</span>
            <span className="font-display text-2xl font-bold leading-none text-white">
              {summary.eventsRaced}/{summary.eventsInSeries || '—'}
            </span>
          </div>
          {summary.gapToLeader != null && summary.gapToLeader > 0 ? (
            <p className="hidden text-sm text-zinc-400 sm:block">
              {summary.gapToLeader} pts behind the class leader
            </p>
          ) : summary.gapToLeader === 0 && summary.seriesRank === 1 ? (
            <p className="hidden text-sm text-green-400 sm:block">Leading the class</p>
          ) : null}
        </div>
      </div>
      {seriesPicker}
      {riderPicker}
      {classPicker}
    </>
  )
}
