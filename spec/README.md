# EventSync specs

Executable build specs for the EventSync Vite + React + TypeScript + Supabase PWA.

| File | Contents |
|---|---|
| [00-product.md](./00-product.md) | Purpose, personas, jobs, non-goals |
| [01-stack.md](./01-stack.md) | Frozen stack, env, VS Code, phases, Event Code URL |
| [02-data-supabase.md](./02-data-supabase.md) | Existing schema, required migrations, RLS, queries |
| [03-ui.md](./03-ui.md) | Pages, routes, states, MX magazine visual direction |
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
- Status effect media: `public/videos/` (`start_race`, `active_race`, `finish_race` mp4, `pause_race.jpg` while the video button is selected); toggled via a video icon beside the chart icon (mutually exclusive when selecting)
- PWA: app shell offline, live timing network-only
- Admin URL hidden from public nav
