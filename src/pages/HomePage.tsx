import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { SelectParticipantBox } from '../components/SelectParticipantBox'
import { newsArticles } from '../data/news'
import { useEventCode } from '../hooks/useEventCode'
import { useEventCodeQueryParam } from '../hooks/useEventCodeQueryParam'
import { useRaceInProgress } from '../hooks/useRaceInProgress'
import { formatEventDate } from '../lib/format'
import type { RaceStatus } from '../types/database'

const IN_PROGRESS: RaceStatus[] = ['Staging', 'Active', 'Paused']

export function HomePage() {
  const navigate = useNavigate()
  const { context, error, resolving, submitCode } = useEventCode()
  const { code: codeParam, matched: codeMatched } = useEventCodeQueryParam()
  const raceQuery = useRaceInProgress(context?.eventId ?? null)
  const [params] = useSearchParams()
  const [draft, setDraft] = useState('')
  const [promptParticipant, setPromptParticipant] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const promptedForCode = useRef<string | null>(null)
  const needCode = params.get('needCode') === '1'

  // `/?code=XXXX` — same as typing the code: resolve then offer Select Rider.
  useEffect(() => {
    if (!codeParam || !codeMatched) return
    if (promptedForCode.current === codeParam) return
    promptedForCode.current = codeParam
    setPromptParticipant(true)
  }, [codeParam, codeMatched])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  useEffect(() => {
    if (needCode) inputRef.current?.focus()
  }, [needCode])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const resolved = await submitCode(draft)
    if (resolved) {
      setDraft('')
      setPromptParticipant(true)
    }
  }

  function goAfterParticipantStep() {
    const status = raceQuery.data?.status
    const inProgress = status != null && IN_PROGRESS.includes(status)
    navigate(inProgress ? '/live' : '/order')
  }

  function onParticipantOk() {
    goAfterParticipantStep()
  }

  function onParticipantSkip() {
    // Keep any already-selected participant; Skip only continues.
    goAfterParticipantStep()
  }

  const dateLabel = formatEventDate(context?.eventDate)
  const place = [context?.track, context?.location].filter(Boolean).join(' · ')
  const actionsBusy = promptParticipant && raceQuery.isLoading

  return (
    <div className="space-y-10">
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <section>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <img src="/rider.svg" alt="Motocross racer" className="h-[6.75rem] w-auto shrink-0" />
            <h1 className="min-w-0 flex-1 basis-[12rem] font-display text-3xl font-extrabold uppercase leading-none tracking-tight sm:text-4xl">
              Live laps. Staging. Results. Don’t miss your moto.
            </h1>
          </div>

          <form id="event-code" onSubmit={onSubmit} className="mt-8 max-w-md">
            <label htmlFor="event-code-input" className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Event Code
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                ref={inputRef}
                id="event-code-input"
                className="control outline outline-2 outline-[#f5c518]"
                placeholder="Event Code"
                value={draft}
                maxLength={12}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'event-code-error' : undefined}
                onChange={(event) => setDraft(event.target.value)}
              />
              <button className="btn" type="submit" disabled={resolving} title="Resolve this Event Code">
                {resolving ? 'Checking…' : 'Go to event'}
              </button>
            </div>
            {context ? (
              <button
                type="button"
                className="mt-3 text-sm font-semibold uppercase text-[#f5c518]"
                title="Enter a different Event Code"
                onClick={() => {
                  setPromptParticipant(false)
                  inputRef.current?.focus()
                }}
              >
                Change event
              </button>
            ) : null}
            {needCode && !error ? (
              <p className="mt-3 text-sm text-[#f5c518]">Enter your Event Code to see live timing and results.</p>
            ) : null}
            {error ? (
              <p id="event-code-error" className="mt-3 text-sm text-red-400" role="alert">
                {error}
              </p>
            ) : null}
          </form>

          {context ? (
            <div className="mt-6 max-w-lg space-y-4">
              <button
                type="button"
                className="inline-flex w-full cursor-pointer flex-col gap-1 border border-[#f5c518] bg-transparent px-4 py-3 text-left disabled:cursor-wait"
                aria-label={`Open ${context.eventName}`}
                title="Open live timing or results for this event"
                disabled={raceQuery.isLoading}
                onClick={goAfterParticipantStep}
              >
                <span className="font-display text-2xl font-bold uppercase">{context.organizationName}</span>
                <span className="text-lg">{context.eventName}</span>
                {dateLabel || place ? (
                  <span className="text-sm text-zinc-400">
                    {[dateLabel, place].filter(Boolean).join(' · ')}
                  </span>
                ) : null}
                <span className="text-xs tracking-widest text-zinc-500">{context.code}</span>
              </button>

              {promptParticipant ? (
                <SelectParticipantBox
                  eventId={context.eventId}
                  title="Choose your Rider"
                  onOk={onParticipantOk}
                  onSkip={onParticipantSkip}
                  actionsBusy={actionsBusy}
                />
              ) : null}

              <p className="text-sm text-zinc-400">
                Share this event:{' '}
                <a
                  className="break-all text-[#f5c518] underline underline-offset-2"
                  href={`${window.location.origin}/?code=${encodeURIComponent(context.code)}`}
                  title="Open this event with the Event Code in the URL"
                >
                  {`${window.location.origin}/?code=${encodeURIComponent(context.code)}`}
                </a>
              </p>
            </div>
          ) : null}

        </section>

        <aside>
          <h2 className="font-display text-3xl font-bold uppercase">MX / SX News</h2>
          <ul className="mt-4 space-y-4">
            {newsArticles.map((article) => (
              <li key={article.href}>
                <a
                  href={article.href}
                  target="_blank"
                  rel="noreferrer"
                  title={`Open article: ${article.title}`}
                  className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 border border-white/10 bg-[#1a1a1a] p-2"
                >
                  <img src={article.imageUrl} alt="" className="h-24 w-24 object-cover" />
                  <span>
                    <span className="font-display text-xl font-bold uppercase leading-tight">{article.title}</span>
                    <span className="mt-1 block text-sm text-zinc-400">{article.summary}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          to="/order"
          title="View race order for this event"
          className="panel cursor-pointer font-display text-2xl font-bold uppercase no-underline"
        >
          Race order
        </Link>
        <Link
          to="/live"
          title="View live race timing"
          className="panel cursor-pointer font-display text-2xl font-bold uppercase no-underline"
        >
          Races in progress
        </Link>
        <Link
          to="/results"
          title="View completed race results"
          className="panel cursor-pointer font-display text-2xl font-bold uppercase no-underline"
        >
          Completed races
        </Link>
        <Link
          to="/stream"
          title="View live stream (coming soon)"
          className="panel cursor-pointer font-display text-2xl font-bold uppercase no-underline"
        >
          Live stream
        </Link>
      </section>
    </div>
  )
}
