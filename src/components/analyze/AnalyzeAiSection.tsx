import { useState } from 'react'
import {
  askAnalyzeAi,
  remainingAiQuestions,
  type AnalyzeAiBlock,
} from '../../lib/analyzeAiClient'
import { SimpleBarChart, SimpleLineChart, SimplePieChart } from './SimpleCharts'

const ADVICE_SUGGESTION = 'Advice to improve my results'
/** Sent to the model when the Advice chip is picked (chip label stays short). */
const ADVICE_SUGGESTION_PROMPT =
  'Advice to improve my results, show table of what a training routine might look like for the next month'

const SUGGESTIONS_FULL = [
  ADVICE_SUGGESTION,
  'Show my place trend this series',
  'Who am I closest to in the standings?',
  'Which class had the biggest field this series?',
  'Who scored the most points in my class?',
  'Compare my moto 1 vs moto 2 average',
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

function AiTable({ block }: { block: Extract<AnalyzeAiBlock, { type: 'table' }> }) {
  return (
    <div className="max-h-64 overflow-auto border border-white/10">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-[#141414] text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            {block.columns.map((column) => (
              <th key={column} className="whitespace-nowrap px-2 py-1.5 font-semibold">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t border-white/10 text-zinc-200">
              {block.columns.map((_, colIndex) => {
                const cell = row[colIndex]
                return (
                  <td key={colIndex} className="whitespace-nowrap px-2 py-1.5">
                    {cell == null || cell === '' ? '—' : String(cell)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AiBlockView({ block }: { block: AnalyzeAiBlock }) {
  if (block.type === 'table') {
    return (
      <div>
        {block.title ? (
          <p className="mb-1 text-xs uppercase tracking-wide text-zinc-500">{block.title}</p>
        ) : null}
        <AiTable block={block} />
      </div>
    )
  }

  if (block.type === 'pie') {
    const colors = ['#f5c518', '#38bdf8', '#52525b', '#4ade80', '#fbbf24']
    return (
      <div>
        {block.title ? (
          <p className="mb-1 text-xs uppercase tracking-wide text-zinc-500">{block.title}</p>
        ) : null}
        <SimplePieChart
          data={block.slices.map((slice, index) => ({
            ...slice,
            color: colors[index % colors.length]!,
          }))}
        />
      </div>
    )
  }

  if (block.type === 'line') {
    const colors = ['#38bdf8', '#fbbf24', '#4ade80']
    return (
      <div>
        {block.title ? (
          <p className="mb-1 text-xs uppercase tracking-wide text-zinc-500">{block.title}</p>
        ) : null}
        <SimpleLineChart
          categories={block.categories}
          series={block.series.map((item, index) => ({
            name: item.name,
            data: item.data,
            color: colors[index % colors.length]!,
          }))}
        />
      </div>
    )
  }

  // bar
  return (
    <div>
      {block.title ? (
        <p className="mb-1 text-xs uppercase tracking-wide text-zinc-500">{block.title}</p>
      ) : null}
      <SimpleBarChart
        categories={block.categories}
        values={block.values}
        colors={block.colors}
        height={220}
        className="h-auto w-full"
        showYAxis
      />
    </div>
  )
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
  const [blocks, setBlocks] = useState<AnalyzeAiBlock[]>([])
  const [canAnswer, setCanAnswer] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [remaining, setRemaining] = useState(() => remainingAiQuestions())
  const suggestions = earlySeries ? SUGGESTIONS_EARLY : SUGGESTIONS_FULL

  function runSuggestion(item: string) {
    const prompt = item === ADVICE_SUGGESTION ? ADVICE_SUGGESTION_PROMPT : item
    setQuestion(prompt)
    void submit(prompt)
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
    setBlocks([])
    setCanAnswer(true)
    try {
      const result = await askAnalyzeAi({ question: trimmed, data })
      setAnswer(result.answer)
      setBlocks(result.blocks)
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
              {suggestions.map((item) => (
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
            {suggestions.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="w-fit border border-[#f5c518]/40 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-[#f5c518] hover:bg-[#f5c518]/10"
                  onClick={() => setMoreSuggestions((prev) => !prev)}
                >
                  {moreSuggestions ? 'Less' : 'More'}
                </button>
              </div>
            ) : null}
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
            {blocks.map((block, index) => (
              <AiBlockView key={`${block.type}-${block.title ?? ''}-${index}`} block={block} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}
