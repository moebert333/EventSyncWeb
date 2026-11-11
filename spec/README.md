# EventSync specs

Executable build specs for the EventSync Vite + React + TypeScript + Supabase PWA.

| File | Contents |
|---|---|
| [00-product.md](./00-product.md) | Purpose, personas, jobs, non-goals |
| [01-stack.md](./01-stack.md) | Frozen stack, env, VS Code, phases, Event Code URL |
| [02-data-supabase.md](./02-data-supabase.md) | Existing schema, required migrations, RLS, queries, sample seed scripts |
| [03-ui.md](./03-ui.md) | Pages, routes (incl. Dashboard), states, MX magazine visual direction, simulation (demo + manual) |
| [04-pwa.md](./04-pwa.md) | Installability, caching, persistence |
| [05-acceptance.md](./05-acceptance.md) | Checklists for an agent or human implementer |

## How to use

1. Adjust names, copy, and allowlist emails in these files first.
2. Point an AI coding session at this folder: “Build only what these specs list, in phase order.”
3. Keep `CreateAllTables.sql` as the race-app schema; do not redesign timing tables in the website.

## Locked decisions already in the specs

- Spectators: **no login** — Event Code, QR, or `/?code=`
- Admins: **magic link** + `admin_allowlist`
- Data UI: **TanStack Query**
- Live refresh: 2–3s while a race is Staging/Active/Paused
- Progress chart history: browser `localStorage` only (`eventsync.lapProgress`); cleared on race change or restart (place 0)
- Optional Selected participant: `localStorage` `eventsync.selectedParticipant`; set on Home, Completed Races, or Dashboard; used on Live / Results / Dashboard
- **Dashboard** (`/dashboard`): series results dashboard + Groq AI via server proxy (`GROQ_API_KEY`, never `VITE_`); panel layout in `eventsync.analyzePanelLayout`
- Status effect media: `public/videos/` (`start_race`, `active_race`, `finish_race` mp4, `pause_race.jpg` while the video button is selected); toggled via a video icon beside the chart icon (mutually exclusive when selecting)
- PWA: app shell offline, live timing network-only
- Admin URL hidden from public nav
- **Demo mode** (`event_codes.demo`): auto continuous client-only sim (Staging → Active → Finished loop; races 5–10 or fallback); local race-order / staging overlay; never writes timing DB; Header manual start hidden
- **Manual simulation** (non-demo only; Ctrl+click / long-press brand on `/live`): same phase loop for one chosen race; leave `/live` confirms cancel; Pause / Continue / Stop; lap 2–120s (default `SIMULATE_SECS`); never writes timing DB
- **Moto Challenge sample seed**: `scripts/seed-moto-challenge.ps1` regenerates and loads org `MX Racing Inc` / series `Moto Challenge 2027` (codes `ESYNC-DEMO-1`…`5`, all `demo=true`; live on `ESYNC-DEMO-4`); wipe only that org; Postgres URI required (not API keys)
