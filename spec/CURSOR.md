# EventSync — Cursor build guide

Use this file when starting or resuming work in Cursor. The executable specs are the `specs/*.md` files. Do not invent features that are not in those files.

## Project in one sentence

EventSync is a Vite + React + TypeScript PWA. Spectators enter an Event Code (no login) and see live race timing and results from Supabase. Organization admins use a magic link plus an allowlist and a claim code. The local race app is the source of truth for organizations, series, events, and all timing data.

## Spec files (read these first)

| File | What it locks |
|---|---|
| `specs/00-product.md` | Purpose, personas, non-goals |
| `specs/01-stack.md` | Stack, env, VS Code, phases, Event Code URL |
| `specs/02-data-supabase.md` | Schema, RLS, claim code, queries |
| `specs/03-ui.md` | Routes, pages, visual direction |
| `specs/04-pwa.md` | Installability and caching |
| `specs/05-acceptance.md` | Done checklist |
| `CreateAllTables.sql` | Tables and views (do not redesign) |
| `specs/rls-policies.sql` | Policies and `claim_organization()` |

## Hard rules

- Vite + React + TypeScript + Tailwind + React Router + TanStack Query + `@supabase/supabase-js`.
- No Next.js, no Express, no service-role key in the client.
- Spectators never sign in. Access is Event Code, QR, or `/?code=`.
- Admins use magic link + `admin_allowlist` + claim code. `/admin` is not in the public nav.
- Website does not create organizations, series, events, timing, entries, or results. The local race app does.
- Website admin may rename an organization (`name`, `description` only) and create/edit Event Codes after a successful claim.
- Live timing is Supabase Realtime on `active_timing` and `status`. A 15–30s poll is backup only.
- Do not implement phase 7 (race order, announcements, live stream) beyond stub pages.

## First Cursor prompt

Paste this into Cursor Composer (Agent mode) after the specs are in the repo:

```text
Build the EventSync app from the specs in specs/.

Read specs/README.md, specs/00-product.md, specs/01-stack.md, specs/02-data-supabase.md, specs/03-ui.md, specs/04-pwa.md, and specs/05-acceptance.md before writing code. Also use CreateAllTables.sql and specs/rls-policies.sql as the database contract.

Follow the phase order in specs/01-stack.md. Start with phase 1 only: scaffold Vite React TypeScript, Tailwind, React Router, TanStack Query, Supabase client, and VS Code debug config.

Do not add features listed as non-goals or FUTURE. Do not redesign timing tables. Do not put the service role key in the client.

When phase 1 is done, stop and summarize what was created.
```

After phase 1 works, continue with:

```text
Continue EventSync from the specs. Implement phase 2: Home page with Event Code entry, and /admin magic-link login plus claim code. Match specs/03-ui.md and the claim flow in specs/02-data-supabase.md. Spectator pages stay read-only.
```

## Suggested local setup

From an empty folder on your PC:

```bash
mkdir EventSync
cd EventSync
npm create vite@latest . -- --template react-ts
npm install
npm install @supabase/supabase-js @tanstack/react-query react-router-dom
npm install -D tailwindcss @tailwindcss/vite
```

Then copy into this folder:

- `specs/` (all `.md` files plus `rls-policies.sql`)
- `CreateAllTables.sql`
- this `CURSOR.md`

Create `.env.local` (gitignored):

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Never commit the service role key.

## Phase order (do not skip ahead)

1. Scaffold: Vite React TS, Tailwind, Router, TanStack Query, Supabase client, VS Code debug.
2. Home + Event Code resolution + `/admin` (magic link, claim code, rename org, Event Code + QR).
3. PWA (`vite-plugin-pwa`) + icons + production build.
4. Deploy HTTPS and set Supabase Auth redirect URLs.
5. Races In Progress (`/live`) and Completed Races (`/results`), with Realtime on live timing.
6. Re-deploy and test.
7. FUTURE stubs only unless the spec is updated: race order, announcements, live stream.

## First files Cursor should create

```text
.env.example
.vscode/settings.json
.vscode/launch.json
src/main.tsx
src/App.tsx
src/index.css
src/lib/supabase.ts
src/lib/eventContext.ts
src/types/database.ts
src/hooks/useEventCode.ts
src/pages/HomePage.tsx
src/pages/admin/AdminLoginPage.tsx
src/pages/admin/AdminCallbackPage.tsx
src/pages/admin/OrganizationAdminPage.tsx
```

Live and results pages come in phase 5:

```text
src/hooks/useRaceInProgress.ts
src/hooks/useLiveTiming.ts
src/hooks/useEventResults.ts
src/pages/RacesInProgressPage.tsx
src/pages/CompletedRacesPage.tsx
```

## Admin flow Cursor must follow

1. User opens `/admin` and requests a magic link.
2. After callback, if they have no allowlist row with `claimed_at` set, show a claim-code field.
3. Call `claim_organization(code)` (defined in `specs/rls-policies.sql`).
4. On success, show organizations they have claimed. They may switch if they have more than one.
5. They can edit organization display name and Event Codes. They cannot create series or events.

## When you are stuck

Ask Cursor to re-read the relevant spec file instead of guessing. If a spec and the SQL disagree, the SQL in `CreateAllTables.sql` wins for table shape, and `specs/02-data-supabase.md` wins for access rules.
