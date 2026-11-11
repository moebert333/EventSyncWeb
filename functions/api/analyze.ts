import { handleAnalyzeAi } from '../../server/analyzeAiHandler'

type Env = {
  XAI_API_KEY?: string
  XAI_MODEL?: string
}

/** Cloudflare Pages Function: POST /api/analyze → xAI (secret: XAI_API_KEY). */
export async function onRequest(context: {
  request: Request
  env: Env
}): Promise<Response> {
  return handleAnalyzeAi(context.request, context.env)
}
