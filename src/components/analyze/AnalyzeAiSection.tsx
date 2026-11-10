import { useState } from 'react'
import {
  askAnalyzeAi,
  remainingAiQuestions,
  type AnalyzeAiChartSpec,
} from '../../lib/analyzeAiClient'
import { SimpleBarChart, SimpleLineChart, SimplePieChart } from './SimpleCharts'

const SUGGESTIONS = [
  'Show my place trend this series',
  'Who am I closest to in the standings?',
  'Compare my moto 1 vs moto 2 average',
  'Did I improve after round 3?',
  'What’s my points needed to take the lead?',
]

type Props = {
  data: unknown
  enabled: boolean
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

export function AnalyzeAiSection({ data, enabled }: Props) {
  const [open, setOpen] = useState(true)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [chart, setChart] = useState<AnalyzeAiChartSpec | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [remaining, setRemaining] = useState(() => remainingAiQuestions())

  async function submit(nextQuestion: string) {
    const trimmed = nextQuestion.trim()
    if (!trimmed || busy || !enabled) return
    setBusy(true)
    setError(null)
    setAnswer(null)
    setChart(null)
    try {
      const result = await askAnalyzeAi({ question: trimmed, data })
      setAnswer(result.answer)
      setChart(result.chart ?? null)
      setRemaining(remainingAiQuestions())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI request failed')
      setRemaining(remainingAiQuestions())
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="border border-[#f5c518]/40 bg-[#1a1a1a]">
      <header className="flex items-center gap-1 border-b border-white/10 px-2 py-1.5">
        <button
          type="button"
          className="inline-flex min-h-10 min-w-10 items-center justify-center text-zinc-400 hover:text-white"
          aria-expanded={open}
          title={open ? 'Collapse' : 'Expand'}
          onClick={() => setOpen((prev) => !prev)}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
            {open ? (
              <path fill="currentColor" d="M6.5 9 12 15.5 17.5 9H6.5Z" />
            ) : (
              <path fill="currentColor" d="M9 6.5 15.5 12 9 17.5V6.5Z" />
            )}
          </svg>
        </button>
        <h2 className="min-w-0 flex-1 font-display text-lg font-bold uppercase tracking-wide text-[#f5c518]">
          Analyze your Data with AI
        </h2>
        <span className="pr-2 text-xs text-zinc-500">{remaining} left today</span>
      </header>

      {open ? (
        <div className="space-y-3 p-3">
          {!enabled ? (
            <p className="text-sm text-zinc-400">Select a rider to ask about their series results.</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((item) => (
              <button
                key={item}
                type="button"
                className="border border-white/15 px-2 py-1 text-left text-xs text-zinc-300 hover:border-[#f5c518]/50 disabled:opacity-50"
                disabled={!enabled || busy}
                onClick={() => {
                  setQuestion(item)
                  void submit(item)
                }}
              >
                {item}
              </button>
            ))}
          </div>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault()
              void submit(question)
            }}
          >
            <input
              className="control flex-1"
              placeholder="Ask about place trends, standings, motos…"
              value={question}
              disabled={!enabled || busy}
              onChange={(event) => setQuestion(event.target.value)}
            />
            <button type="submit" className="btn shrink-0" disabled={!enabled || busy || !question.trim()}>
              {busy ? 'Thinking…' : 'Ask'}
            </button>
          </form>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          {answer ? (
            <div className="space-y-3 border border-white/10 p-3">
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
      ) : null}
    </section>
  )
}
