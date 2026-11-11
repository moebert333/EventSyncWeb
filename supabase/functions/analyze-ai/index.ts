/**
 * Production proxy for Analyze AI (xAI Grok).
 * Deploy: supabase functions deploy analyze-ai
 * Secret: supabase secrets set XAI_API_KEY=...
 * Client: VITE_ANALYZE_API_URL=<project>/functions/v1/analyze-ai
 */

const XAI_URL = 'https://api.x.ai/v1/chat/completions'
/** Default Grok model; override with XAI_MODEL secret. */
const DEFAULT_MODEL = 'grok-4.7'

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

  const apiKey = Deno.env.get('XAI_API_KEY')
  const model = Deno.env.get('XAI_MODEL')?.trim() || DEFAULT_MODEL
  if (!apiKey) {
    return Response.json({ error: 'XAI_API_KEY secret is not set' }, { status: 503, headers: cors })
  }

  try {
    const body = (await req.json()) as { question?: string; data?: unknown }
    const question = body.question?.trim()
    if (!question) {
      return Response.json({ error: 'question is required' }, { status: 400, headers: cors })
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

    const xaiJson = await xaiResponse.json()
    if (!xaiResponse.ok) {
      return Response.json(
        { error: xaiJson?.error ?? `xAI error ${xaiResponse.status}` },
        { status: 502, headers: cors },
      )
    }

    const content = xaiJson?.choices?.[0]?.message?.content ?? ''
    let parsed: { answer?: string; chart?: unknown; canAnswer?: unknown } = {}
    try {
      parsed = content ? JSON.parse(content) : {}
    } catch {
      parsed = { answer: content || 'Could not parse model response.', chart: null, canAnswer: false }
    }

    const canAnswer = parsed.canAnswer !== false
    return Response.json(
      {
        canAnswer,
        answer:
          parsed.answer ??
          (canAnswer
            ? 'No answer returned.'
            : 'Not enough data in this series selection to answer that.'),
        chart: canAnswer ? (parsed.chart ?? null) : null,
      },
      { headers: cors },
    )
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Analyze proxy failed' },
      { status: 500, headers: cors },
    )
  }
})
