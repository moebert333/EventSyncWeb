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
Answer ONLY from the provided JSON.
Data layout: events[{n,d}], classes[name], riders([name]|[name,plate]),
seriesResults[eventIdx,classIdx,riderIdx,place,points] (full series),
focusRider (selected rider detail + motos + standings = FULL focus-class series table).
DEFAULT SCOPE: focusRider + focusClass unless another class/series-wide ask is clear
(e.g. "what are my best finishes?" → focus rider in focusClass).
For "closest in standings" / gap questions: use focusRider.standings (ranked by pts).
Find the you:true row (or matching name), then compare pts to the rows above and below.
Use riders + seriesResults for plate/event/class questions across the series.
Keep answers concise (2-5 sentences).
If the JSON does not contain enough information to answer, set canAnswer to false,
chart to null, and put a short clear message in answer saying what is missing.
When a chart helps and canAnswer is true, also return a chart object.
Respond with JSON only, no markdown:
{"canAnswer":true|false,"answer":"string","chart":null|{"type":"bar"|"line"|"pie","title":"string","categories":["..."],"values":[numbers],"series":[{"name":"string","data":[numbers]}],"slices":[{"label":"string","value":number}]}}
Use values for simple bar charts, series for line charts, slices for pie charts.`

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

    let parsed: { answer?: string; chart?: unknown; canAnswer?: unknown } = {}
    try {
      parsed = content
        ? (JSON.parse(content) as { answer?: string; chart?: unknown; canAnswer?: unknown })
        : {}
    } catch {
      parsed = { answer: content || 'Could not parse model response.', chart: null, canAnswer: false }
    }

    const canAnswer = parsed.canAnswer !== false
    sendJson(res, 200, {
      canAnswer,
      answer:
        parsed.answer ??
        (canAnswer
          ? 'No answer returned.'
          : 'Not enough data in this series selection to answer that.'),
      chart: canAnswer ? (parsed.chart ?? null) : null,
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
