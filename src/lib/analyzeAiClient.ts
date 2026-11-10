export type AnalyzeAiChartSpec = {
  type: 'bar' | 'line' | 'pie'
  title?: string
  categories?: string[]
  values?: number[]
  series?: { name: string; data: number[] }[]
  slices?: { label: string; value: number }[]
}

export type AnalyzeAiResponse = {
  answer: string
  chart?: AnalyzeAiChartSpec | null
}

const DAILY_LIMIT = 30
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
  return {
    answer: typeof row.answer === 'string' ? row.answer : 'No answer returned.',
    chart: (row.chart as AnalyzeAiChartSpec | null | undefined) ?? null,
  }
}
