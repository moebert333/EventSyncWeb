# EventSync — Acceptance criteria

Build only what `00`–`04` specify. FUTURE pages may be stubs.

## Agent constraints

```text
Vite + React + TypeScript + Tailwind + React Router + TanStack Query + Supabase.
No Next.js, no Express, no service-role key in the client.
Spectators never sign in.
Admins use magic link + admin_allowlist.
Every public query is filtered by Event Code context.
PWA after Home + Admin work, not before Event Code resolution.
```

## A. Scaffold and environment

- [ ] App created with Vite `react-ts`
- [ ] Tailwind and Router working
- [ ] `.vscode` debug launches Chrome at `http://localhost:5173`
- [ ] `.env.example` documents `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`
- [ ] Supabase client lives in `src/lib/supabase.ts`

## B. Event Code (public)

- [ ] Home accepts 6–12 character code
- [ ] `/?code=VALUE` resolves the same way
- [ ] Valid code stores org + series + event and shows names in the header
- [ ] Unknown code shows an error and does not send the user to `/live`
- [ ] `/live` and `/results` without context redirect to Home with the code field emphasized
- [ ] Codes compare case-insensitively
- [ ] Context survives refresh and PWA relaunch (`localStorage`)
- [ ] User can enter a different code to switch events/orgs

## C. Home

- [ ] Top nav: Home, Races In Progress, Completed Races, Live Stream
- [ ] No Admin link in that nav
- [ ] Large marketing description of the product
- [ ] MX racer logo image present
- [ ] Right column news cards (static list acceptable) with image, summary, outbound link
- [ ] Style is dark magazine / MX Action–inspired, not default Vite template

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
- [ ] Each event has a 6–12 character Event Code; new events get a random default
- [ ] Admin can change the code; unique constraint errors are visible
- [ ] QR for `https://<origin>/?code=<CODE>` is visible for the selected event
- [ ] Admin cannot edit races, timing, or results from this site

## F. Races In Progress

- [ ] Uses `race_in_progress` + `active_race_timing` (+ class names view)
- [ ] Zero rows → empty state, not a crash
- [ ] One live race: header prefixed “Event Name:” (larger, bold), race number, session, status, and class list
- [ ] Class chips are buttons. One class is selected (accent background), or All Classes to the right of the chips. Only that class table is shown unless All Classes is selected. First class is selected on load.
- [ ] One row per participant in the selected class. No Class column. A single class starts sorted by place. All Classes lists every class, adds a Class column, and defaults to Class then Place. Clicking any column header sorts that table; clicking it again reverses the order. Best lap shows as `#n - time`.
- [ ] Class name line shows “Elapsed Time:” with race elapsed time to the second (local 1s tick while Active between polls), then a light-green “Best Lap Time” label with black text, just above the table
- [ ] Clicking a row selects it with a light grey shade
- [ ] Clicking a row selects it and opens the progress chart, with the chart button selected and the video closed
- [ ] Once any visible row has lap ≥ 1, the row on the greatest lap with the lowest current lap time is shaded light green
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
- [ ] Scoped to Event Code’s event (or series fallback as in data spec)

## G. Completed Races

- [ ] Org name read-only from Event Code
- [ ] Series filter (all or one) then event picker; default event = coded event
- [ ] Filter by class **or** participant, then Show results
- [ ] Rows from `event_class_results`
- [ ] Empty and error states handled
- [ ] Switching event inside the same org does not require a new code

## H. Security

- [ ] Service role key absent from repo and client bundle
- [ ] RLS enabled; anon cannot write
- [ ] Admin writes limited to org/series/events/event_codes as specified
- [ ] Timing/results writes remain the local race app’s job

## I. PWA / deploy

- [ ] Manifest standalone + 192/512 icons
- [ ] SPA fallback so `/live` refresh works
- [ ] Production HTTPS host
- [ ] Auth redirect URLs updated
- [ ] Installable on Android Chrome; iOS hint documented or shown
- [ ] Live data not served from a stale SW cache as if current

## J. Explicitly not failing MVP

- Race order / announcements content
- Multi-camera live stream
- Spectator accounts
- Offline timing
- Allowlist admin UI
- Perfect pixel clone of motocrossactionmag.com

## Suggested test Event Code

`DEMO01AB` (seed in dev) → one org, one live race, one completed event with results.
