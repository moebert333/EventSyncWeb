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

**Out of scope:** Next.js, TanStack Start, Express, XAMPP, IIS, service-role key in the frontend.

## Environment variables

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

- Rename from dashboard “anon” / “publishable” key.
- **Never** put the service role key in the Vite app or git.
- File: `.env.local` (gitignored). Provide `.env.example` with empty keys.

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
    types/database.ts          # generated or hand-maintained from schema
    hooks/useEventCode.ts
    hooks/useRaceInProgress.ts
    hooks/useEventResults.ts
    components/
    pages/HomePage.tsx
    pages/RacesInProgressPage.tsx
    pages/CompletedRacesPage.tsx
    pages/admin/AdminLoginPage.tsx
    pages/admin/AdminCallbackPage.tsx
    pages/admin/OrganizationAdminPage.tsx
    pages/future/RaceOrderPage.tsx      # stub route ok
    pages/future/LiveStreamPage.tsx     # stub + “coming soon”
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
- Live timing query: `refetchInterval` 2–3 seconds while status is `Staging` | `Active` | `Paused`; stop interval when no in-progress race.
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
7. Race order / announcements + Live Stream (FUTURE — stub pages allowed before this).
8. Re-deploy and test.

Do not start PWA or live pages before Home + Event Code resolution works.
