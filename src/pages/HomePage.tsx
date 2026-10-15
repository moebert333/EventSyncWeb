import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { newsArticles } from '../data/news'
import { useEventCode } from '../hooks/useEventCode'
import { formatEventDate } from '../lib/format'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
}

function isIosDevice(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || Boolean(nav.standalone)
}

export function HomePage() {
  const { context, error, resolving, submitCode } = useEventCode()
  const [params] = useSearchParams()
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const tried = useRef<string | null>(null)
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const needCode = params.get('needCode') === '1'
  const codeParam = params.get('code')

  useEffect(() => {
    if (!codeParam || tried.current === codeParam) return
    tried.current = codeParam
    void submitCode(codeParam)
  }, [codeParam, submitCode])

  useEffect(() => {
    if (needCode) inputRef.current?.focus()
  }, [needCode])

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const ok = await submitCode(draft)
    if (ok) setDraft('')
  }

  const dateLabel = formatEventDate(context?.eventDate)
  const place = [context?.track, context?.location].filter(Boolean).join(' · ')
  const showIosHint = isIosDevice() && !isStandalone()

  return (
    <div className="space-y-10">
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <section>
          <img src="/rider.svg" alt="Motocross racer" className="mb-4 h-36 w-auto" />
          <h1 className="font-display text-5xl font-extrabold uppercase leading-none tracking-tight sm:text-7xl">
            Live laps. Staging. Results. Don’t miss your moto.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-zinc-300">
            EventSync shows in-progress timing and completed results pushed from the track. No racer login.
          </p>

          <form id="event-code" onSubmit={onSubmit} className="mt-8 max-w-md">
            <label htmlFor="event-code-input" className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Event Code
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                ref={inputRef}
                id="event-code-input"
                className={`control uppercase ${needCode || error ? 'outline outline-2 outline-[#f5c518]' : ''}`}
                value={draft}
                maxLength={12}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'event-code-error' : undefined}
                onChange={(event) => setDraft(event.target.value)}
              />
              <button className="btn" type="submit" disabled={resolving}>
                {resolving ? 'Checking…' : 'Go to event'}
              </button>
            </div>
            {context ? (
              <button
                type="button"
                className="mt-3 text-sm font-semibold uppercase text-[#f5c518]"
                onClick={() => inputRef.current?.focus()}
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
            <div className="mt-6 inline-flex max-w-lg flex-col gap-1 border border-[#f5c518] px-4 py-3">
              <span className="font-display text-2xl font-bold uppercase">{context.organizationName}</span>
              <span className="text-lg">{context.eventName}</span>
              {dateLabel || place ? (
                <span className="text-sm text-zinc-400">
                  {[dateLabel, place].filter(Boolean).join(' · ')}
                </span>
              ) : null}
              <span className="text-xs uppercase tracking-widest text-zinc-500">{context.code}</span>
            </div>
          ) : null}

          {showIosHint ? (
            <p className="mt-6 text-sm text-zinc-400">Share → Add to Home Screen</p>
          ) : null}
          {installEvent && !isStandalone() ? (
            <button
              type="button"
              className="btn btn-ghost mt-4"
              onClick={() => {
                void installEvent.prompt()
                setInstallEvent(null)
              }}
            >
              Install EventSync
            </button>
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

      <section className="grid gap-3 sm:grid-cols-3">
        <Link to="/live" className="panel font-display text-2xl font-bold uppercase">
          Races in progress
        </Link>
        <Link to="/results" className="panel font-display text-2xl font-bold uppercase">
          Completed races
        </Link>
        <Link to="/stream" className="panel font-display text-2xl font-bold uppercase">
          Live stream
        </Link>
      </section>
    </div>
  )
}
