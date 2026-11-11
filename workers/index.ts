import { handleAnalyzeAi } from '../server/analyzeAiHandler'

export interface Env {
  ASSETS: Fetcher
  XAI_API_KEY?: string
  XAI_MODEL?: string
}

/** Workers + Assets entry: /api/analyze proxies to xAI; everything else is the SPA. */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname === '/api/analyze' || pathname === '/api/analyze/') {
      return handleAnalyzeAi(request, env)
    }
    return env.ASSETS.fetch(request)
  },
}
