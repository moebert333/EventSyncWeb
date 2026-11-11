const XAI_URL = 'https://api.x.ai/v1/chat/completions'
/** Default Grok model; override with XAI_MODEL. */
export const DEFAULT_ANALYZE_MODEL = 'grok-4.7'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, authorization, x-client-info, apikey',
}

const SYSTEM = `You are a motocross / race results analyst for EventSync.
Answer ONLY from the provided JSON (race data + adviceGuidelines).
Data layout: events[{n,d}], classes[name], riders([name]|[name,plate]),
seriesResults[eventIdx,classIdx,riderIdx,place,points] (full series),
focusRider (selected rider detail + motos + standings = FULL focus-class series table),
adviceGuidelines (general MX diet/training/race-day notes for advice questions).
DEFAULT SCOPE: focusRider + focusClass unless another class/series-wide ask is clear
(e.g. "what are my best finishes?" → focus rider in focusClass).
For another class (e.g. "250 B standings"), build rankings from seriesResults + classes + riders
(sum points per rider in that classIdx across events; sort by points desc).
For "closest in standings" / gap questions: use focusRider.standings (ranked by pts).
Find the you:true row (or matching name), then compare pts to the rows above and below.
Use riders + seriesResults for plate/event/class questions across the series.
ADVICE / improvement / tips questions: use focusRider patterns (motoAvg, motoSpread,
pointsLeft, places, rank/gap, roundCompare) to spot limiters, then map to relevant items
from adviceGuidelines (diet, hydration, sleep, warm-up, starts, consistency, recovery).
Ground race-specific claims in results; use adviceGuidelines for general suggestions.
Do NOT set canAnswer false only because coaching notes are not in results — guidelines are provided.
Diet/training tips are general guidance, not personalized medical advice; say so briefly when relevant.
Still set canAnswer false only when there is no usable focusRider/series data to personalize against.
Always include a short answer string (2-5 sentences; advice may be slightly longer with 3–6 concrete tips).
The UI shows answer text PLUS visual blocks.
When the user asks for a table, grid, chart, graph, standings, ranking, comparison, trend,
distribution, or any visual — and canAnswer is true — put one or more blocks in "blocks".
Prefer type "table" for standings/rankings/lists; "bar" for comparisons; "line" for trends; "pie" for shares.
You may return multiple blocks (e.g. table + bar). Use [] when no visual is needed.
Respond with JSON only, no markdown:
{"canAnswer":true|false,"answer":"string","blocks":[BLOCK,...]}
BLOCK is one of:
{"type":"table","title":"string","columns":["#","Rider","Pts","Ev"],"rows":[[1,"Name",40,3],[2,"Other",38,3]]}
{"type":"bar","title":"string","categories":["..."],"values":[numbers]}
{"type":"line","title":"string","categories":["..."],"series":[{"name":"string","data":[numbers]}]}
{"type":"pie","title":"string","slices":[{"label":"string","value":number}]}
Cell values in table rows may be string or number. Do not invent riders or points not in the JSON.`

export type AnalyzeAiEnv = {
  XAI_API_KEY?: string
  XAI_MODEL?: string
}

function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: cors })
}

/** Shared Analyze AI proxy (Vite middleware, Cloudflare Worker/Pages, etc.). */
export async function handleAnalyzeAi(
  request: Request,
  env: AnalyzeAiEnv,
): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }
  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  const apiKey = env.XAI_API_KEY?.trim()
  const model = env.XAI_MODEL?.trim() || DEFAULT_ANALYZE_MODEL
  if (!apiKey) {
    return json(503, {
      error:
        'XAI_API_KEY is not set. Add it as a Cloudflare secret (production) or in .env.local (dev).',
    })
  }

  try {
    const body = (await request.json()) as { question?: string; data?: unknown }
    const question = body.question?.trim()
    if (!question) {
      return json(400, { error: 'question is required' })
    }

    const xaiResponse = await fetch(XAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: JSON.stringify({ question, data: body.data ?? null }),
          },
        ],
      }),
    })

    const xaiJson: unknown = await xaiResponse.json().catch(() => null)
    if (!xaiResponse.ok) {
      const err =
        xaiJson && typeof xaiJson === 'object' && 'error' in xaiJson
          ? (xaiJson as { error: unknown }).error
          : null
      const message =
        err && typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : err != null
            ? JSON.stringify(err)
            : `xAI error ${xaiResponse.status}`
      return json(502, { error: message })
    }

    const content =
      xaiJson &&
      typeof xaiJson === 'object' &&
      'choices' in xaiJson &&
      Array.isArray((xaiJson as { choices: unknown }).choices)
        ? (
            (xaiJson as { choices: { message?: { content?: string } }[] }).choices[0]?.message
              ?.content ?? ''
          )
        : ''

    let parsed: {
      answer?: string
      chart?: unknown
      blocks?: unknown
      canAnswer?: unknown
    } = {}
    try {
      parsed = content
        ? (JSON.parse(content) as {
            answer?: string
            chart?: unknown
            blocks?: unknown
            canAnswer?: unknown
          })
        : {}
    } catch {
      parsed = {
        answer: content || 'Could not parse model response.',
        blocks: [],
        chart: null,
        canAnswer: false,
      }
    }

    const canAnswer = parsed.canAnswer !== false
    const blocks = canAnswer
      ? Array.isArray(parsed.blocks)
        ? parsed.blocks
        : parsed.chart
          ? [parsed.chart]
          : []
      : []

    return json(200, {
      canAnswer,
      answer:
        parsed.answer ??
        (canAnswer
          ? 'No answer returned.'
          : 'Not enough data in this series selection to answer that.'),
      blocks,
      chart: blocks[0] ?? null,
    })
  } catch (error) {
    return json(500, {
      error: error instanceof Error ? error.message : 'Analyze proxy failed',
    })
  }
}
