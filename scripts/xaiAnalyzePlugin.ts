import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { DEFAULT_ANALYZE_MODEL, handleAnalyzeAi } from '../server/analyzeAiHandler.ts'

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function handleAnalyze(
  req: IncomingMessage,
  res: ServerResponse,
  apiKey: string | undefined,
  model: string,
) {
  try {
    const body = req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH'
      ? await readBody(req)
      : undefined
    const request = new Request('http://localhost/api/analyze', {
      method: req.method ?? 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: body && body.length ? new Uint8Array(body) : undefined,
    })
    const response = await handleAnalyzeAi(request, {
      XAI_API_KEY: apiKey,
      XAI_MODEL: model,
    })
    res.statusCode = response.status
    response.headers.forEach((value: string, key: string) => {
      res.setHeader(key, value)
    })
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch (error) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Analyze proxy failed',
      }),
    )
  }
}

/** Dev/preview middleware: POST /api/analyze → xAI Grok (key from XAI_API_KEY). */
export function xaiAnalyzePlugin(
  apiKey: string | undefined,
  model: string | undefined = DEFAULT_ANALYZE_MODEL,
): Plugin {
  const resolvedModel = model?.trim() || DEFAULT_ANALYZE_MODEL
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
