# EventSync — Product spec

## Name

**EventSync** — live race status and results for motocross / supercross events.

## One-paragraph purpose

EventSync is a public website and installable PWA for racers and spectators at a race event. A separate local race application pushes timing and results into Supabase. This site never writes race data; it lets people at the track see the race in progress, completed results, series analysis charts (and optional AI Q&A over that data), and (later) announcements and live video so they do not miss staging, practice, or racing.

## Who it is for

| Persona | How they get in | What they can do |
|---|---|---|
| Racer / spectator | Event Code or QR. **No account.** | Read-only: current event, in-progress timing, completed results, series Dashboard |
| Organization admin | Magic link, only if email is on the allowlist | Define organization, series, events, and Event Codes |

## User jobs (MVP)

1. Scan a QR or type a 4–12 character Event Code and land on that organization + event.
2. Optionally pick a Selected participant on Home (search name/plate) to carry into live timing and completed results.
3. See that a race is staging / in progress / paused, choose one class, and follow live participant timing plus a place and lap-time progress chart.
4. Browse completed event results, filter by series → event → class or participant.
5. Open Dashboard to review a rider’s results across a series (standings summary, charts, swappable panels) and optionally ask AI questions grounded in that data.
6. See the event race order by race number, with completed/active markers and Selected participant races highlighted; see Warning text in the Event/Rider header and Warning Popup / notifications when staging or in-race.
7. Install the site on a phone home screen and reopen it without signing in (public pages).
8. An allowlisted organizer signs in with a magic link and creates/edits organization, series, events, and Event Codes.

## Simulation (client-only; never writes timing DB)

Two modes; both synthesize `race_in_progress` / `active_race_timing`-shaped data in memory and must **never** write timing, status, or race rows to Supabase. Full UI rules: `03-ui.md` §3b.

1. **Demo mode** — when `event_codes.demo` is true for the resolved Event Code: continuous background loop (prefer competitive races 5–10; else 1–5 / available). Local race-order overlay drives Active / completed / Staging alerts and Warning text. Manual Header start is hidden.
2. **Manual simulation** — non-demo events only: Ctrl+click / long-press brand on Active Race (`/live`) opens a dialog; loops Staging → Active → Finished for the **chosen race only** while the user stays on `/live`.

## Non-goals (this spec)

- Sign-in for racers or spectators
- Editing timing, entries, or results from the website (source of truth is the local race app; simulation is in-memory only and does not count as writing)
- Native App Store / Play Store apps
- Server-side rendering / Next.js / custom Express backend (Analyze AI uses Vite middleware in local/preview and an optional Supabase Edge Function in production — not Express)
- Offline-first sync of live timing
- Admin UI linked from the public header (admin is a hidden URL only)
- Announcements attached to Race Order (phase 7 — FUTURE)
- Live stream grid (phase 7 — specified as FUTURE)
- Persisted series championship tables in Supabase (Dashboard derives standings client-side from `event_class_results`)

## Access model

- Public users are scoped to **one organization** after a valid Event Code (or QR / `?code=` URL).
- They may switch **events and series inside that organization** on Completed Races, and **series** (plus rider) on Dashboard.
- They must not query or see other organizations’ events.
- Admins use `/admin` (exact path in UI spec). Public nav never links there.

## Success

- A spectator with only a printed Event Code can open live timing and results on a phone in under 30 seconds.
- The production HTTPS build is installable as a PWA.
- Admins not on the email allowlist cannot create a session that reaches admin pages.
- Lighthouse / Chrome can install the app; public flows work with no login.

## Source inputs

- Schema: `CreateAllTables.sql` (organizations → series → events → races / classes / timing / results).
- Product notes: `Web Site Spec.txt`.
- Local race app is out of repo; it already writes to these tables and views.
