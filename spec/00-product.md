# EventSync — Product spec

## Name

**EventSync** — live race status and results for motocross / supercross events.

## One-paragraph purpose

EventSync is a public website and installable PWA for racers and spectators at a race event. A separate local race application pushes timing and results into Supabase. This site never writes race data; it lets people at the track see the race in progress, completed results, and (later) race order, announcements, and live video so they do not miss staging, practice, or racing.

## Who it is for

| Persona | How they get in | What they can do |
|---|---|---|
| Racer / spectator | Event Code or QR. **No account.** | Read-only: current event, in-progress timing, completed results |
| Organization admin | Magic link, only if email is on the allowlist | Define organization, series, events, and Event Codes |

## User jobs (MVP)

1. Scan a QR or type a 6–12 character Event Code and land on that organization + event.
2. See that a race is staging / in progress / paused, choose one class, and follow live participant timing plus a place and lap-time progress chart.
3. Browse completed event results, filter by series → event → class or participant.
4. Install the site on a phone home screen and reopen it without signing in (public pages).
5. An allowlisted organizer signs in with a magic link and creates/edits organization, series, events, and Event Codes.

## Non-goals (this spec)

- Sign-in for racers or spectators
- Editing timing, entries, or results from the website (source of truth is the local race app)
- Native App Store / Play Store apps
- Server-side rendering / Next.js / custom Express backend
- Offline-first sync of live timing
- Admin UI linked from the public header (admin is a hidden URL only)
- Race order / announcements page (phase 7 — specified as FUTURE)
- Live stream grid (phase 7 — specified as FUTURE)

## Access model

- Public users are scoped to **one organization** after a valid Event Code (or QR / `?code=` URL).
- They may switch **events and series inside that organization** on Completed Races.
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
