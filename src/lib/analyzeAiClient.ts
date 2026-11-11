export type AnalyzeAiTableBlock = {
  type: 'table'
  title?: string
  columns: string[]
  rows: (string | number | boolean | null)[][]
}

export type AnalyzeAiBarBlock = {
  type: 'bar'
  title?: string
  categories: string[]
  values: number[]
  colors?: string[]
}

export type AnalyzeAiLineBlock = {
  type: 'line'
  title?: string
  categories: string[]
  series: { name: string; data: number[] }[]
}

export type AnalyzeAiPieBlock = {
  type: 'pie'
  title?: string
  slices: { label: string; value: number }[]
}

/** Visual block the model may return (rendered under the answer text). */
export type AnalyzeAiBlock =
  | AnalyzeAiTableBlock
  | AnalyzeAiBarBlock
  | AnalyzeAiLineBlock
  | AnalyzeAiPieBlock

/** @deprecated Prefer AnalyzeAiBlock; kept for older single-chart responses. */
export type AnalyzeAiChartSpec = AnalyzeAiBlock

export type AnalyzeAiResponse = {
  answer: string
  /** Zero or more visuals (table / bar / line / pie). */
  blocks: AnalyzeAiBlock[]
  /** False when the model could not answer from the provided series data. */
  canAnswer?: boolean
}

const DAILY_LIMIT = 20
const USAGE_KEY = 'eventsync.analyzeAiUsage'

function usageToday(): { day: string; count: number } {
  const day = new Date().toISOString().slice(0, 10)
  try {
    const raw = localStorage.getItem(USAGE_KEY)
    if (!raw) return { day, count: 0 }
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { day, count: 0 }
    const row = parsed as Record<string, unknown>
    if (row.day !== day) return { day, count: 0 }
    return { day, count: typeof row.count === 'number' ? row.count : 0 }
  } catch {
    return { day, count: 0 }
  }
}

export function remainingAiQuestions(): number {
  return Math.max(0, DAILY_LIMIT - usageToday().count)
}

function bumpUsage() {
  const { day, count } = usageToday()
  localStorage.setItem(USAGE_KEY, JSON.stringify({ day, count: count + 1 }))
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const out = value.map((item) => String(item))
  return out.length ? out : null
}

function asNumberArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null
  const out = value.map((item) => Number(item))
  if (out.some((n) => !Number.isFinite(n))) return null
  return out
}

function parseBlock(value: unknown): AnalyzeAiBlock | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const type = row.type
  const title = typeof row.title === 'string' ? row.title : undefined

  if (type === 'table') {
    const columns = asStringArray(row.columns)
    if (!columns || !Array.isArray(row.rows)) return null
    const rows = row.rows
      .filter((entry): entry is unknown[] => Array.isArray(entry))
      .map((entry) =>
        entry.map((cell) => {
          if (cell == null) return null
          if (typeof cell === 'boolean' || typeof cell === 'number') return cell
          return String(cell)
        }),
      )
    return { type: 'table', title, columns, rows }
  }

  if (type === 'bar') {
    const categories = asStringArray(row.categories)
    const values = asNumberArray(row.values)
    if (!categories || !values) return null
    const colors = Array.isArray(row.colors)
      ? row.colors.map((item) => String(item))
      : undefined
    return { type: 'bar', title, categories, values, colors }
  }

  if (type === 'line') {
    const categories = asStringArray(row.categories)
    if (!categories || !Array.isArray(row.series)) return null
    const series = row.series
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const s = item as Record<string, unknown>
        const name = typeof s.name === 'string' ? s.name : 'Series'
        const data = asNumberArray(s.data)
        if (!data) return null
        return { name, data }
      })
      .filter((item): item is { name: string; data: number[] } => item != null)
    if (!series.length) return null
    return { type: 'line', title, categories, series }
  }

  if (type === 'pie') {
    if (!Array.isArray(row.slices)) return null
    const slices = row.slices
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const s = item as Record<string, unknown>
        const label = typeof s.label === 'string' ? s.label : String(s.label ?? '')
        const value = Number(s.value)
        if (!label || !Number.isFinite(value)) return null
        return { label, value }
      })
      .filter((item): item is { label: string; value: number } => item != null)
    if (!slices.length) return null
    return { type: 'pie', title, slices }
  }

  // Legacy chart objects sometimes omitted type but had categories/values.
  const categories = asStringArray(row.categories)
  const values = asNumberArray(row.values)
  if (categories && values) return { type: 'bar', title, categories, values }
  return null
}

/** Normalize model payload: prefer `blocks`, fall back to legacy single `chart`. */
export function normalizeAnalyzeAiBlocks(payload: Record<string, unknown>): AnalyzeAiBlock[] {
  const fromBlocks = Array.isArray(payload.blocks)
    ? payload.blocks.map(parseBlock).filter((b): b is AnalyzeAiBlock => b != null)
    : []
  if (fromBlocks.length) return fromBlocks
  const single = parseBlock(payload.chart)
  return single ? [single] : []
}

export async function askAnalyzeAi(input: {
  question: string
  data: unknown
}): Promise<AnalyzeAiResponse> {
  if (remainingAiQuestions() <= 0) {
    throw new Error(`Daily AI limit reached (${DAILY_LIMIT}/day). Try again tomorrow.`)
  }

  const endpoint = import.meta.env.VITE_ANALYZE_API_URL?.trim() || '/api/analyze'
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `AI request failed (${response.status})`
    throw new Error(message)
  }

  bumpUsage()
  const row = (payload ?? {}) as Record<string, unknown>
  const canAnswer = row.canAnswer !== false
  return {
    canAnswer,
    answer:
      typeof row.answer === 'string'
        ? row.answer
        : canAnswer
          ? 'No answer returned.'
          : 'Not enough data in this series selection to answer that.',
    blocks: canAnswer ? normalizeAnalyzeAiBlocks(row) : [],
  }
}
