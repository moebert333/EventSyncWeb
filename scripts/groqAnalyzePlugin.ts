import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
/** llama-3.3-70b-versatile shut down for free/developer tiers (2026-08-16). */
const DEFAULT_MODEL = 'openai/gpt-oss-120b'

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
      error: 'GROQ_API_KEY is not set in .env.local. Add it and restart the dev server.',
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
Answer ONLY from the provided JSON rider/series data. If data is missing, say so.
Keep answers concise (2-5 sentences).
When a chart helps, also return a chart object.
Respond with JSON only, no markdown:
{"answer":"string","chart":null|{"type":"bar"|"line"|"pie","title":"string","categories":["..."],"values":[numbers],"series":[{"name":"string","data":[numbers]}],"slices":[{"label":"string","value":number}]}}
Use values for simple bar charts, series for line charts, slices for pie charts.`

    const groqResponse = await fetch(GROQ_URL, {
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

    const groqJson: unknown = await groqResponse.json().catch(() => null)
    if (!groqResponse.ok) {
      const err =
        groqJson && typeof groqJson === 'object' && 'error' in groqJson
          ? (groqJson as { error: unknown }).error
          : null
      const message =
        err && typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : err != null
            ? JSON.stringify(err)
            : `Groq error ${groqResponse.status}`
      sendJson(res, 502, { error: message })
      return
    }

    const content =
      groqJson &&
      typeof groqJson === 'object' &&
      'choices' in groqJson &&
      Array.isArray((groqJson as { choices: unknown }).choices)
        ? (
            (groqJson as { choices: { message?: { content?: string } }[] }).choices[0]?.message
              ?.content ?? ''
          )
        : ''

    let parsed: { answer?: string; chart?: unknown } = {}
    try {
      parsed = content ? (JSON.parse(content) as { answer?: string; chart?: unknown }) : {}
    } catch {
      parsed = { answer: content || 'Could not parse model response.', chart: null }
    }

    sendJson(res, 200, {
      answer: parsed.answer ?? 'No answer returned.',
      chart: parsed.chart ?? null,
    })
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Analyze proxy failed',
    })
  }
}

/** Dev/preview middleware: POST /api/analyze → Groq (key from GROQ_API_KEY). */
export function groqAnalyzePlugin(
  apiKey: string | undefined,
  model: string | undefined = DEFAULT_MODEL,
): Plugin {
  const resolvedModel = model?.trim() || DEFAULT_MODEL
  return {
    name: 'groq-analyze-api',
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
