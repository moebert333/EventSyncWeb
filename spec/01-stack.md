# EventSync — Stack and development environment

## Frozen stack

Do not substitute unless the spec is updated.

| Layer | Choice | Why |
|---|---|---|
| Scaffold | `npm create vite@latest eventsync -- --template react-ts` | Fast SPA, matches VS Code workflow |
| UI | React 19 + TypeScript (strict) | Project already TypeScript-first |
| Styling | Tailwind CSS 4 | Fast mobile-first layout |
| Routing | React Router 7 | SPA routes, Event Code as query/path |
| Server state | TanStack Query 5 | Cache + refetch live timing |
| Backend | Supabase (Postgres + Auth + RLS) | Data already lives here |
| Client | `@supabase/supabase-js` | Browser client only |
| PWA | `vite-plugin-pwa` | Installable on iOS/Android |
| Hosting | Vercel, Netlify, or Cloudflare Pages | HTTPS required for PWA + Auth |
| Analyze AI (optional) | Groq Chat Completions (OpenAI-compatible) | Free-tier OK for commercial; proxied — never call from the browser with a public key |

**Out of scope:** Next.js, TanStack Start, Express, XAMPP, IIS, service-role key in the frontend.

## Environment variables

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
# When true, Points require every moto 1…max scored. Default false = Points after any one moto.
VITE_REQUIRE_ALL_MOTOS=false
# Server-only (never VITE_): Vite /api/analyze proxy for Analyze AI (Groq).
GROQ_API_KEY=
# Optional; default openai/gpt-oss-20b (lower cost). Prefer Groq Developer tier for full-series TPM.
# GROQ_MODEL=openai/gpt-oss-20b
# Optional production override (e.g. Supabase Edge Function URL). Default: /api/analyze
# VITE_ANALYZE_API_URL=
```

- Rename from dashboard “anon” / “publishable” key.
- **Never** put the service role key or `GROQ_API_KEY` in a `VITE_*` var, the client bundle, or git.
- File: `.env.local` (gitignored). Provide `.env.example` with empty keys.
- Local/preview: `vite.config.ts` loads `GROQ_API_KEY` via `loadEnv` and mounts POST `/api/analyze` (see `scripts/groqAnalyzePlugin.ts`).
- Production static hosts: deploy `supabase/functions/analyze-ai` with secret `GROQ_API_KEY`, then set `VITE_ANALYZE_API_URL` to that function URL.

## Auth choices (locked)

| Role | Method | Session |
|---|---|---|
| Racer / spectator | None. Event Code / QR / `?code=` | Code stored in `sessionStorage` + `localStorage` under `eventsync.eventCode` |
| Organizer admin | Supabase **magic link** (`signInWithOtp` email, link not 6-digit OTP for v1) | Persist session (default Supabase client storage) |

Admin gate (application + RLS):

1. User requests magic link.
2. Supabase may create an `auth.users` row on first successful click (default).
3. App loads `admin_allowlist` by `auth.uid()` email (case-insensitive).
4. If no allowlist row or `is_active = false`, sign out and show “not authorized”.
5. Allowlist rows are inserted by a project owner in the SQL editor for v1 (no self-serve signup UI).

Redirect URLs to configure in Supabase Auth:

- Local: `http://localhost:5173/admin/callback`
- Production: `https://<host>/admin/callback`

Site URL must be the production HTTPS origin after deploy.

## Project layout (target)

```text
eventsync/
  .vscode/settings.json
  .vscode/launch.json
  .vscode/tasks.json
  .env.example
  index.html
  package.json
  vite.config.ts
  public/pwa-192x192.png
  public/pwa-512x512.png
  public/apple-touch-icon.png
  src/
    main.tsx
    App.tsx
    index.css
    lib/supabase.ts
    lib/eventContext.ts
    lib/selectedParticipant.ts
    types/database.ts          # generated or hand-maintained from schema
    hooks/useEventCode.ts
    hooks/useRaceInProgress.ts
    hooks/useEventResults.ts
    hooks/useSeriesAnalyzeData.ts
    lib/analyzeMetrics.ts
    lib/analyzePanels.ts
    lib/analyzeAiClient.ts
    components/
    components/SelectParticipantBox.tsx
    components/EventParticipantHeader.tsx
    components/analyze/                 # Analyze panels, charts, AI section
    pages/HomePage.tsx
    pages/RacesInProgressPage.tsx
    pages/CompletedRacesPage.tsx
    pages/AnalyzePage.tsx
    pages/admin/AdminLoginPage.tsx
    pages/admin/AdminCallbackPage.tsx
    pages/admin/OrganizationAdminPage.tsx
    pages/RaceOrderPage.tsx
    hooks/useEventRaceOrder.ts
    pages/future/LiveStreamPage.tsx     # stub + “coming soon”
  scripts/groqAnalyzePlugin.ts          # Vite POST /api/analyze → Groq
  supabase/functions/analyze-ai/        # optional production AI proxy
```

## VS Code

`.vscode/settings.json`

```json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "editor.formatOnSave": true
}
```

`.vscode/launch.json` — Chrome against `http://localhost:5173`, `webRoot` = workspace folder.

Daily loop: `npm install` → `npm run dev` → F5 to debug.

Production-like check: `npm run build` && `npm run preview` or `npx serve dist -s`.

## Scripts

```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "lint": "eslint ."
}
```

## Data fetching rules

- All Supabase reads go through TanStack Query.
- Race-in-progress query: `refetchInterval` ~2.5s whenever an event is selected (including empty/Finished) so a newly active race appears automatically.
- Live timing query: `refetchInterval` ~2.5s while status is `Staging` | `Active` | `Paused`; pause timing polls when Finished/absent.
- Mutations exist only on admin pages (organizations, series, events, event_codes).
- Spectator pages are `SELECT` only.

## Event Code entry points

1. Home page input (max 12 chars, case-insensitive store, preserve display casing optional).
2. QR encoding `https://<host>/?code=ABC123`.
3. Direct URL `/?code=ABC123` or `/event/ABC123` (pick one; default **`/?code=`** so QR stays simple).

On valid code:

- Resolve `event_codes.code` → `event_id` → `events` → `series` → `organization`.
- Persist `{ organizationId, seriesId, eventId, code }`.
- Invalid / unknown code: stay on Home, show error, do not clear a previously valid context unless user explicitly changes code.

## Build phases (implementation order)

1. Scaffold Vite React TS + Tailwind + Router + VS Code debug config.
2. Home + Organization Admin + schema additions in this spec (`admin_allowlist`, Event Code uniqueness, RLS).
3. `vite-plugin-pwa` + icons + production build test.
4. Deploy HTTPS; set Supabase Auth redirect URLs.
5. Races In Progress + Completed Races.
6. Re-deploy and test.
7. Race Order page + Live Stream / announcements (stream stub ok).
8. Dashboard (`/dashboard`): series standings summary, panel board, Groq AI proxy.
9. Re-deploy and test.

Do not start PWA or live pages before Home + Event Code resolution works.
