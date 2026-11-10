/**
 * Production proxy for Analyze AI (Groq).
 * Deploy: supabase functions deploy analyze-ai
 * Secret: supabase secrets set GROQ_API_KEY=...
 * Client: VITE_ANALYZE_API_URL=<project>/functions/v1/analyze-ai
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
/** llama-3.3-70b-versatile shut down for free/developer tiers (2026-08-16). */
const DEFAULT_MODEL = 'openai/gpt-oss-120b'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: cors })
  }

  const apiKey = Deno.env.get('GROQ_API_KEY')
  const model = Deno.env.get('GROQ_MODEL')?.trim() || DEFAULT_MODEL
  if (!apiKey) {
    return Response.json({ error: 'GROQ_API_KEY secret is not set' }, { status: 503, headers: cors })
  }

  try {
    const body = (await req.json()) as { question?: string; data?: unknown }
    const question = body.question?.trim()
    if (!question) {
      return Response.json({ error: 'question is required' }, { status: 400, headers: cors })
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

    const groqJson = await groqResponse.json()
    if (!groqResponse.ok) {
      return Response.json(
        { error: groqJson?.error ?? `Groq error ${groqResponse.status}` },
        { status: 502, headers: cors },
      )
    }

    const content = groqJson?.choices?.[0]?.message?.content ?? ''
    let parsed: { answer?: string; chart?: unknown } = {}
    try {
      parsed = content ? JSON.parse(content) : {}
    } catch {
      parsed = { answer: content || 'Could not parse model response.', chart: null }
    }

    return Response.json(
      { answer: parsed.answer ?? 'No answer returned.', chart: parsed.chart ?? null },
      { headers: cors },
    )
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Analyze proxy failed' },
      { status: 500, headers: cors },
    )
  }
})
