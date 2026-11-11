# EventSync — Acceptance criteria

Build only what `00`–`04` specify. FUTURE pages may be stubs.

## Agent constraints

```text
Vite + React + TypeScript + Tailwind + React Router + TanStack Query + Supabase.
No Next.js, no Express, no service-role key in the client.
GROQ_API_KEY is server-only (Vite /api/analyze or Edge Function); never VITE_GROQ_*.
Spectators never sign in.
Admins use magic link + admin_allowlist.
Every public query is filtered by Event Code context.
PWA after Home + Admin work, not before Event Code resolution.
```

## A. Scaffold and environment

- [ ] App created with Vite `react-ts`
- [ ] Tailwind and Router working
- [ ] `.vscode` debug launches Chrome at `http://localhost:5173`
- [ ] `.env.example` documents `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_REQUIRE_ALL_MOTOS`, and `GROQ_API_KEY` (server-only; never `VITE_GROQ_*`)
- [ ] Supabase client lives in `src/lib/supabase.ts`

## B. Event Code (public)

- [ ] Home accepts 4–12 character code
- [ ] `/?code=VALUE` resolves the same way
- [ ] Valid code stores org + series + event and shows names in the header
- [ ] Unknown code shows an error and does not send the user to `/live`
- [ ] `/live`, `/results`, `/dashboard`, and `/order` without context redirect to Home with the code field emphasized
- [ ] Codes compare case-insensitively
- [ ] Context survives refresh and PWA relaunch (`localStorage`)
- [ ] User can enter a different code to switch events/orgs

## C. Home

- [ ] Top nav includes Race Order, Active Race, Results, Dashboard, Live Stream (Dashboard after Results)
- [ ] Actionable controls show a short hover description (`title`)
- [ ] No Admin link in that nav
- [ ] Large marketing description of the product
- [ ] MX racer logo image present
- [ ] Right column news cards (static list acceptable) with image, summary, outbound link
- [ ] Style is dark magazine / MX Action–inspired, not default Vite template
- [ ] After Event Code resolves/changes, Select participant panel with Ok / Skip; then route to Live if Staging/Active/Paused else Completed Races
- [ ] Selected participant persists in `localStorage` (`eventsync.selectedParticipant`) and clears when the event changes

## D. Admin magic link

- [ ] `/admin` asks for email and sends a magic link
- [ ] Callback URL registered for local and production
- [ ] Allowlisted active email reaches Organization Admin
- [ ] Non-allowlisted email cannot use admin UI after link click
- [ ] Session persists until Sign out
- [ ] New magic link is required only after sign-out, cleared storage, or expired session — not on every PWA open

## E. Organization Admin

- [ ] Create/edit organization name + description
- [ ] Create/edit series under that org
- [ ] Create/edit events (`name`, `description`, `date`, `track`, `location`)
- [ ] Each event has a 4–12 character Event Code; new events get a random default
- [ ] Admin can change the code; unique constraint errors are visible
- [ ] QR for `https://<origin>/?code=<CODE>` is visible for the selected event
- [ ] Admin cannot edit races, timing, or results from this site

## F. Races In Progress

- [ ] Uses `race_in_progress` + `active_race_timing` (+ class names view)
- [ ] Zero rows → empty state, not a crash
- [ ] Shared Event / Rider header strip with Warning text (Title Box link) and Warning Popup per `03-ui.md` rules (race_num gap; Practice wording except rule 1; yellow bg → black text; flash only for in-Staging Title “You are in this Race” and Staging/in-race popups)
- [ ] Warning Popup notifies when popup message changes or active race changes; one live race shows race number, session, status, and class list
- [ ] Status pill colors: Waiting light grey, Staging lighter orange, Active green, Paused yellow, Finished light blue (contrasting text); click shows `Race status: {status}`
- [ ] Class chips are buttons. One class is selected (accent background), or All Classes to the right of the chips. Only that class table is shown unless All Classes is selected. First class is selected on load.
- [ ] Switching to the page with a Selected participant who is in the race selects that class/row and opens the chart (once per shown race)
- [ ] One row per participant in the selected class. No Class column. A single class starts sorted by place. All Classes lists every class, adds a Class column, and defaults to Class then Place. Clicking any column header sorts that table; clicking it again reverses the order. Best lap shows as `#n - time`.
- [ ] Class name line shows “Elapsed Time:” with race elapsed time to the second (local 1s tick while Active between polls), then a clickable light-green highlight-mode label (default “Best Lap Time”) with black text, just above the table
- [ ] Highlight-mode menu offers 1st Place, Best Lap Time, and Participant; green row highlight follows the choice
- [ ] Clicking a row selects it with a light grey shade
- [ ] Clicking a row selects it and opens the progress chart, with the chart button selected and the video closed
- [ ] Best Lap Time mode: once any visible row has lap ≥ 1, the row on the greatest lap with the lowest current lap time is shaded light green
- [ ] The current-lap column is labeled Lap Time
- [ ] Each poll stores place, lap time, best lap time, gap to leader, and gap to next per participant and lap in `localStorage` (`eventsync.lapProgress`). Nothing is written to Supabase.
- [ ] Saved chart data is cleared when a different race is shown
- [ ] Saved chart data is cleared when every reported place is 0 (race restart), and that poll is not recorded
- [ ] Chart icon sits to the right of the status pill and toggles a line chart just above the class chips
- [ ] Video icon sits beside the chart icon (when status media exists) and toggles that slot: Staging → `start_race.mp4`, Active → `active_race.mp4`, Paused → `pause_race.jpg` only while the video button is selected, Finished → `finish_race.mp4`
- [ ] Selecting chart or video opens that panel and unselects the other; unselecting either leaves the other unchanged. A table-row click opens the chart and unselects the video
- [ ] Selecting the page leaves the status video closed. When a new race starts while the page is open, the video starts open if that status has a video. Chart starts closed
- [ ] Chart uses the selected row, or the first row if none is selected. X = lap. Left and right Y default to Place and Lap Time, or the axes last saved in this browser (`eventsync.chartAxes`). Clicking the legend shows Left axis and Right axis dropdowns (Place, Lap Time, Best Lap, Gap to Leader, Gap to Next) and a Save button. Save stores the choice and returns to the legend. A click outside the legend cancels and keeps the previous legend
- [ ] Fewer than 2 stored laps shows “Chart is Waiting for 2 Laps Data...”
- [ ] Finished races from `race_in_progress` still show the header and `active_race_timing` table
- [ ] Timing polls only while status is Staging / Active / Paused; Finished still loads timing once
- [ ] Race header keeps polling when empty or Finished so a newly active race for the event appears without a manual refresh
- [ ] A newly detected race while the page is open closes the chart and opens the status video (when available)
- [ ] Scoped to Event Code’s event (or series fallback as in data spec)

## F2. Simulation (client-only; no timing DB writes)

Shared phase behavior:

- [ ] Staging (lap-0 / empty timing) holds `SIMULATE_SECS`, then Active; Active until lap cap, then Finished; Finished holds `SIMULATE_SECS` before advancing
- [ ] Pause freezes Staging/Finished holds and Active lap generation; Continue resumes without counting paused wall time
- [ ] No inserts/updates to `active_timing` / `status` / `races`; Results stay real DB data

### Demo mode (`event_codes.demo`)

- [ ] Resolving a demo Event Code auto-starts continuous simulation without visiting `/live`
- [ ] Header Ctrl+click / long-press simulation entry is disabled
- [ ] Race set prefers competitive 5–10; else 1–5; else available competitive races; wraps and resets local completed flags
- [ ] Race Order shows simulated race as active; Warning text / Staging alerts follow simulated active race
- [ ] Event strip shows yellow `DEMO MODE` (mobile) or `DEMO MODE - {name}` (desktop); tooltip = full event name
- [ ] Banner is Demo with Pause / Continue only (no Stop); leaving `/live` does not cancel the loop
- [ ] `/live` keeps EventParticipantHeader so next-race / warning strip follows the sim

### Manual simulation (non-demo)

- [ ] Can only be started on Active Race (`/live`); Ctrl+click / long-press off that page explains to go to Active Race
- [ ] Ctrl+click or long-press (~1.8s) EventSync brand opens the simulation dialog; normal click / short tap still goes Home
- [ ] Dialog lists current-event **races only** (no practices); requires Event Code context
- [ ] Approx. lap time defaults to `SIMULATE_SECS`; valid range 2–120s with validation / clamp
- [ ] Ok starts client-only loop for the **chosen race only** (Staging → Active → Finished → restart)
- [ ] At Staging/start, each entrant has a lap-0 zero/empty timing row until the first lap is recorded
- [ ] Live page shows simulated timing with realistic place / lap-time variation; prior lap rows stay frozen
- [ ] While simulating, Simulation banner is shown and the Active Race participant header strip is hidden
- [ ] Banner shows Pause / Continue / Stop; Stop (banner or dialog) returns `/live` to real Supabase data
- [ ] Leaving `/live` while simulating prompts “Simulation will be Cancelled” with Ok (stop + navigate) / Cancel (stay)
- [ ] Race Order / Staging alerts stay on real DB data (no manual overlay)

## G. Completed Races

- [ ] Org name read-only from Event Code
- [ ] Series filter (all or one) then event picker; default event = coded event
- [ ] Top Event / clickable Participant header (same as Live)
- [ ] Collapsible “Select Results Filter:” panel with up/down control; Show results collapses it
- [ ] Filter by class **or** participant, then Show results
- [ ] Entering with a Selected participant who has an event class selects that first class, loads class results, and collapses the panel; otherwise the panel stays expanded
- [ ] Selected participant row in class results is highlighted light grey when present
- [ ] Changing the Participant dropdown updates the Selected participant
- [ ] Rows from `event_class_results`
- [ ] When a class already has any Place greater than 0, Place/Points are left as returned
- [ ] When a class has no scored Place and all Points are 0/null, Place is derived from motos up to Race Order max moto (or Final alone)
- [ ] Max moto per class comes from the largest `MOTO n` in `session_name` on Race Order races for that class
- [ ] Points from `event_points` gated by `VITE_REQUIRE_ALL_MOTOS` (default false): false → Points after any one moto 1…max is numerically scored; true → only when every moto 1…max is scored (else Place with Points 0). DNS/DNF does not count as scored for that gate
- [ ] When no Points are scored yet, Points column still shows with 0 per row; Moto 1…max columns always show when max moto is known, with — for unscored cells
- [ ] Non-numeric moto/final values count as 80 for Place; riders with no numeric scoring values get 0 Points when Points are assigned; missing `event_points` rows map to 0
- [ ] Empty and error states handled
- [ ] Switching event inside the same org does not require a new code

## H. Race Order

- [ ] `/order` requires Event Code context
- [ ] Same Event / Rider header strip with Warning text + Warning Popup rules as Live
- [ ] Races listed by `race_num` with expand for class names
- [ ] Completed / Active / Participant marked by color and label
- [ ] Empty and error states handled

## H2. Dashboard

- [ ] `/dashboard` requires Event Code context; no Live/Results-style page title banner; nav label is Dashboard
- [ ] Series | Rider | Class in header; Rider centered; Class lists only that rider’s series classes (default first)
- [ ] Series picker defaults to Event Code series; lists org series only
- [ ] Rider picker lists series entrants; updates Selected participant
- [ ] Header Class drives Standing, Points, Events and most panels
- [ ] Standings panel Class defaults to header Class but can change independently
- [ ] Summary shows Standing, Points, Events (no average overall place)
- [ ] No rider/class results → “No Results” in panel chart/data areas
- [ ] Finish distribution pie renders for a single finish (solid slice)
- [ ] “Analyze your Data with AI” section near top; collapses; suggested prompts + Ask
- [ ] AI uses `/api/analyze` or `VITE_ANALYZE_API_URL`; `GROQ_API_KEY` never in client bundle
- [ ] AI answers grounded in series snapshot JSON; optional chart render
- [ ] Six default panels; 3rd is always Head-to-head (full and early event-count bands)
- [ ] Full defaults: place over time, Recent Momentum, Head-to-head, series standings, points accumulation, moto consistency
- [ ] Early defaults (≤2 events): last race breakdown, gap to neighbors, Head-to-head, points left on table, series standings, round compare
- [ ] Panels collapse, share similar expanded min-height, drag-reorder (mouse + mobile long-press), Select to unused catalog panels
- [ ] Catalog also includes finish distribution, reliability, bike make vs class, and other non-default panels
- [ ] Series standings panel has class selector for any class in the series
- [ ] Panel layout persists (`eventsync.analyzePanelLayout`)
- [ ] Column count follows viewport/container width breakpoints
- [ ] Empty / loading / error states when no rider, no results, or fetch fails

## I. Security

- [ ] Service role key absent from repo and client bundle
- [ ] `GROQ_API_KEY` absent from client bundle and `VITE_*` env
- [ ] RLS enabled; anon cannot write
- [ ] Admin writes limited to org/series/events/event_codes as specified
- [ ] Timing/results writes remain the local race app’s job

## J. PWA / deploy

- [ ] Manifest standalone + 192/512 icons
- [ ] SPA fallback so `/live` refresh works
- [ ] Production HTTPS host
- [ ] Auth redirect URLs updated
- [ ] Installable on Android Chrome; iOS hint documented or shown
- [ ] Live data not served from a stale SW cache as if current
- [ ] Production Analyze AI: Edge Function (or equivalent) with `GROQ_API_KEY` secret when AI is enabled

## K. Explicitly not failing MVP

- Announcements on Race Order
- Multi-camera live stream
- Spectator accounts
- Offline timing
- Allowlist admin UI
- Perfect pixel clone of motocrossactionmag.com
- Unlimited free Groq quota (soft client daily cap is enough)
- Persisted championship table in Supabase (client-derived standings OK)

## L. Moto Challenge sample seed

- [ ] `scripts/generate_moto_challenge_seed.py` regenerates `supabase/seed_moto_challenge_2027.sql` with a new random dataset each run (optional `--seed` for reproducibility)
- [ ] `scripts/seed-moto-challenge.ps1` generates SQL then applies it using `SUPABASE_DIRECT_CONNECT_STRING` / `SUPABASE_DB_URL` / `SUPABASE_DB_PASSWORD` (not API keys)
- [ ] Apply wipes only `org_key = mx-racing-inc` and reloads that org
- [ ] Org `MX Racing Inc`, series `Moto Challenge 2027`, five 2027 events, codes `ESYNC-DEMO-1`…`ESYNC-DEMO-5` (all `demo=true`)
- [ ] ~150 riders, ~10 classes, same class rosters across events; ~2 motos/class; 5 combined (2-class) races
- [ ] Events 1–3 have full `event_results`; Event 4 has races 1–10 completed, race 11 active with ≥5 `active_timing` laps; Event 5 has schedule/entries only
- [ ] `admin_allowlist` includes the configured developer email for that org
- [ ] Site smoke: Event Code `ESYNC-DEMO-4` shows live timing; `ESYNC-DEMO-1`…`3` show results; `ESYNC-DEMO-5` has no completed results yet

## Suggested test Event Codes

- Minimal: `DEMO01AB` (`supabase/seed.sql`, `demo=true`) → one org, one live race, one completed event with results; enters Demo mode.
- Realistic: `ESYNC-DEMO-1`…`ESYNC-DEMO-5` (Moto Challenge sample, all `demo=true`; DB live sample on `ESYNC-DEMO-4`).
