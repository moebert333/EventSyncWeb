# EventSync — PWA and installability

## Goal

The public site must install on a phone home screen and open as a standalone app. Spectators do not sign in; the stored Event Code should survive relaunch.

## Plugin

Use `vite-plugin-pwa` in `vite.config.ts`.

Suggested baseline:

```ts
VitePWA({
  registerType: "autoUpdate",
  includeAssets: ["favicon.ico", "apple-touch-icon.png"],
  manifest: {
    name: "EventSync",
    short_name: "EventSync",
    description: "Live race timing and results",
    theme_color: "#111111",
    background_color: "#111111",
    display: "standalone",
    start_url: "/",
    scope: "/",
    icons: [
      { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  },
  workbox: {
    navigateFallback: "/index.html",
    globPatterns: ["**/*.{js,css,html,ico,png,svg,webp}"]
  }
})
```

`navigateFallback` is required so React Router paths (`/live`, `/results`) work on refresh and when launched from the home screen.

## Icons

Generate simple high-contrast marks for v1 (dirt-bike silhouette or “ES” monogram on dark). Owner may replace.

Required files in `public/`:

- `pwa-192x192.png`
- `pwa-512x512.png`
- `apple-touch-icon.png` (180×180)
- favicon

## Caching policy (v1)

- **App shell** (JS/CSS/HTML/icons): precache. Offline can open Home chrome.
- **Supabase API / live timing:** network-only. Do not serve stale lap times as if live.
- **News images:** cache-first is acceptable.
- **Status videos** (`public/videos/*.mp4`): do not precache. Serve over the network when the Races In Progress page needs them.

Do not claim “offline racing.” Banner when `navigator.onLine === false`.

## Install UX

- Android / desktop Chromium: browser install prompt is enough; optional small “Install EventSync” button if `beforeinstallprompt` fires.
- iOS Safari: no standard prompt. On Home, if standalone is false and iPhone/iPad, show one-line hint: “Share → Add to Home Screen”.
- QR codes printed by admins should use the **HTTPS production origin**, not localhost.

## Event Code persistence

Save resolved context in `localStorage` key `eventsync.eventContext`:

```json
{
  "code": "DEMO01AB",
  "organizationId": 1,
  "organizationName": "…",
  "seriesId": 1,
  "eventId": 1,
  "eventName": "…"
}
```

Restore on PWA launch so the rider does not re-enter the code every session. Provide “Change event” on Home.

## Lap progress (client only)

`localStorage` key `eventsync.lapProgress` stores, for the shown race and each participant, the latest place, lap time, best lap time, gap to leader, and gap to next observed for each lap. This history feeds the progress chart on Races In Progress. Clear it when a different race is shown, and when place numbers are all `0` (race restart). It is not live timing, and the service worker must not treat it as a network response. Do not write it back to Supabase.

## HTTPS and deploy

Service workers and installability require HTTPS (localhost allowed for dev).

After first production deploy:

1. Set Supabase Auth Site URL and additional redirect URLs to `https://<host>/admin/callback`
2. Rebuild so the QR origin and `start_url` match the live host
3. Confirm Chrome → Install app, and iOS Add to Home Screen opens without browser chrome

## What “done” means for phase 3

- `npm run build` succeeds
- `vite preview` or `npx serve dist -s` serves the SPA fallback
- Manifest validates (name, 192 + 512 icons, standalone, start_url)
- Refresh on `/live` does not 404
