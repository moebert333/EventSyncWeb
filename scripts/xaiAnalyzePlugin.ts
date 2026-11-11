import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

const XAI_URL = 'https://api.x.ai/v1/chat/completions'
/** Default Grok model; override with XAI_MODEL in .env.local. */
const DEFAULT_MODEL = 'grok-4.7'

type AnalyzeBody = {
  question?: string
  data?: unknown
}

function readJson(req: IncomingMessage): Promise<AnalyzeBody> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? (JSON.parse(raw) as AnalyzeBody) : {})
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function handleAnalyze(
  req: IncomingMessage,
  res: ServerResponse,
  apiKey: string | undefined,
  model: string,
) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.end()
    return
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }
  if (!apiKey) {
    sendJson(res, 503, {
      error: 'XAI_API_KEY is not set in .env.local. Add it and restart the dev server.',
    })
    return
  }

  try {
    const body = await readJson(req)
    const question = body.question?.trim()
    if (!question) {
      sendJson(res, 400, { error: 'question is required' })
      return
    }

    const system = `You are a motocross / race results analyst for EventSync.
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
          { role: 'system', content: system },
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
      sendJson(res, 502, { error: message })
      return
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
    sendJson(res, 200, {
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
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Analyze proxy failed',
    })
  }
}

/** Dev/preview middleware: POST /api/analyze → xAI Grok (key from XAI_API_KEY). */
export function xaiAnalyzePlugin(
  apiKey: string | undefined,
  model: string | undefined = DEFAULT_MODEL,
): Plugin {
  const resolvedModel = model?.trim() || DEFAULT_MODEL
  return {
    name: 'xai-analyze-api',
    configureServer(server) {
      server.middlewares.use('/api/analyze', (req, res) => {
        void handleAnalyze(req, res, apiKey, resolvedModel)
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/analyze', (req, res) => {
        void handleAnalyze(req, res, apiKey, resolvedModel)
      })
    },
  }
}
