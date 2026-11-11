import { useState } from 'react'
import {
  askAnalyzeAi,
  remainingAiQuestions,
  type AnalyzeAiChartSpec,
} from '../../lib/analyzeAiClient'
import { SimpleBarChart, SimpleLineChart, SimplePieChart } from './SimpleCharts'

const ADVICE_SUGGESTION = 'Advice to improve my results'

const SUGGESTIONS_FULL = [
  'Show my place trend this series',
  'Who am I closest to in the standings?',
  'What events did my plate race in?',
  'Which class had the biggest field this series?',
  'Who scored the most points in my class?',
  'Compare my moto 1 vs moto 2 average',
  ADVICE_SUGGESTION,
]

const SUGGESTIONS_EARLY = [
  'How did my last race go?',
  'Who am I closest to in the standings?',
  'Where did I leave points vs the winner?',
  'How do my motos compare this race?',
  'Compare round 1 vs round 2',
]

type Props = {
  data: unknown
  enabled: boolean
  /** When true (≤2 scored events), use early-series suggestion chips. */
  earlySeries?: boolean
}

function AiChart({ chart }: { chart: AnalyzeAiChartSpec }) {
  if (chart.type === 'pie' && chart.slices?.length) {
    const colors = ['#f5c518', '#38bdf8', '#52525b', '#4ade80', '#fbbf24']
    return (
      <SimplePieChart
        data={chart.slices.map((slice, index) => ({
          ...slice,
          color: colors[index % colors.length]!,
        }))}
      />
    )
  }
  if (chart.type === 'line' && chart.series?.length && chart.categories?.length) {
    const colors = ['#38bdf8', '#fbbf24', '#4ade80']
    return (
      <SimpleLineChart
        categories={chart.categories}
        series={chart.series.map((item, index) => ({
          name: item.name,
          data: item.data,
          color: colors[index % colors.length]!,
        }))}
      />
    )
  }
  if (chart.categories?.length && chart.values?.length) {
    return <SimpleBarChart categories={chart.categories} values={chart.values} />
  }
  if (chart.series?.[0] && chart.categories?.length) {
    return <SimpleBarChart categories={chart.categories} values={chart.series[0].data} />
  }
  return null
}

function defaultAiExpanded(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(min-width: 640px)').matches
}

export function AnalyzeAiSection({ data, enabled, earlySeries = false }: Props) {
  const [expanded, setExpanded] = useState(defaultAiExpanded)
  const [moreSuggestions, setMoreSuggestions] = useState(false)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [chart, setChart] = useState<AnalyzeAiChartSpec | null>(null)
  const [canAnswer, setCanAnswer] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [remaining, setRemaining] = useState(() => remainingAiQuestions())
  const otherSuggestions = (earlySeries ? SUGGESTIONS_EARLY : SUGGESTIONS_FULL).filter(
    (item) => item !== ADVICE_SUGGESTION,
  )

  function runSuggestion(item: string) {
    setQuestion(item)
    void submit(item)
  }

  function toggleExpanded() {
    setExpanded((prev) => {
      if (prev) setMoreSuggestions(false)
      return !prev
    })
  }

  async function submit(nextQuestion: string) {
    const trimmed = nextQuestion.trim()
    if (!trimmed || busy || !enabled) return
    setBusy(true)
    setError(null)
    setAnswer(null)
    setChart(null)
    setCanAnswer(true)
    try {
      const result = await askAnalyzeAi({ question: trimmed, data })
      setAnswer(result.answer)
      setChart(result.chart ?? null)
      setCanAnswer(result.canAnswer !== false)
      setExpanded(true)
      setRemaining(remainingAiQuestions())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI request failed')
      setCanAnswer(false)
      setExpanded(true)
      setRemaining(remainingAiQuestions())
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="border border-[#f5c518]/40 bg-[#1a1a1a]">
      <button
        type="button"
        className="flex w-full items-center gap-1 border-b border-white/10 px-2 py-1.5 text-left hover:bg-white/5"
        aria-expanded={expanded}
        title={expanded ? 'Collapse' : 'Expand'}
        onClick={toggleExpanded}
      >
        <span className="inline-flex min-h-10 min-w-10 items-center justify-center text-zinc-400">
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
            {expanded ? (
              <path fill="currentColor" d="M6.5 9 12 15.5 17.5 9H6.5Z" />
            ) : (
              <path fill="currentColor" d="M9 6.5 15.5 12 9 17.5V6.5Z" />
            )}
          </svg>
        </span>
        <h2 className="min-w-0 flex-1 font-display text-lg font-bold uppercase tracking-wide text-[#f5c518]">
          Analyze your Data with AI
        </h2>
        {expanded ? (
          <span className="pr-2 text-xs text-zinc-500">{remaining} left today</span>
        ) : null}
      </button>

      <div className="space-y-3 p-3">
        {!enabled ? (
          <p className="text-sm text-zinc-400">Load a series with results to ask the AI.</p>
        ) : null}
        {expanded ? (
          <div className="flex flex-col gap-2">
            <div
              className={
                moreSuggestions
                  ? 'flex flex-wrap content-start gap-2'
                  : 'flex max-h-[2.25rem] flex-wrap content-start gap-2 overflow-hidden'
              }
            >
              {otherSuggestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="border border-white/15 px-2 py-1 text-left text-xs text-zinc-300 hover:border-[#f5c518]/50 disabled:opacity-50"
                  disabled={!enabled || busy}
                  onClick={() => runSuggestion(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!earlySeries ? (
                <button
                  type="button"
                  className="w-fit border border-white/15 px-2 py-1 text-left text-xs text-zinc-300 hover:border-[#f5c518]/50 disabled:opacity-50"
                  disabled={!enabled || busy}
                  onClick={() => runSuggestion(ADVICE_SUGGESTION)}
                >
                  {ADVICE_SUGGESTION}
                </button>
              ) : null}
              {otherSuggestions.length > 0 ? (
                <button
                  type="button"
                  className="w-fit border border-[#f5c518]/40 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-[#f5c518] hover:bg-[#f5c518]/10"
                  onClick={() => setMoreSuggestions((prev) => !prev)}
                >
                  {moreSuggestions ? 'Less' : 'More'}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        <form
          className="flex flex-row items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void submit(question)
          }}
        >
          <input
            className="control min-w-0 flex-1"
            placeholder="Ask about place trends, standings, motos…"
            value={question}
            disabled={!enabled || busy}
            onChange={(event) => setQuestion(event.target.value)}
          />
          <button
            type="submit"
            className="btn shrink-0"
            disabled={!enabled || busy || !question.trim()}
          >
            {busy ? 'Thinking…' : 'Ask'}
          </button>
        </form>
        {expanded && error ? <p className="text-sm text-red-400">{error}</p> : null}
        {expanded && answer ? (
          <div
            className={`space-y-3 border p-3 ${
              canAnswer ? 'border-white/10' : 'border-amber-500/40 bg-amber-500/5'
            }`}
          >
            {!canAnswer ? (
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">
                Not enough data
              </p>
            ) : null}
            <p className="text-sm leading-relaxed text-zinc-100">{answer}</p>
            {chart ? (
              <div>
                {chart.title ? (
                  <p className="mb-1 text-xs uppercase tracking-wide text-zinc-500">{chart.title}</p>
                ) : null}
                <AiChart chart={chart} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
