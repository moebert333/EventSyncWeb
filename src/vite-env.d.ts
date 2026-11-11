/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
  /** When true, Points require every moto 1…max. Default / missing = false. */
  readonly VITE_REQUIRE_ALL_MOTOS?: string
  /**
   * Cap Dashboard series events to this many (earliest by date).
   * Use `2` to test the ≤2-event early-series layout. Unset = load all.
   */
  readonly VITE_DASHBOARD_MAX_EVENTS?: string
  /** Optional override for Analyze AI proxy (default `/api/analyze`). */
  readonly VITE_ANALYZE_API_URL?: string
  /** Injected from SIMULATE_SECS (wrangler.toml / .env) via vite.config define. */
  readonly VITE_SIMULATE_SECS?: string
  /** Injected from SIMULATE_LAPS (wrangler.toml / .env) via vite.config define. */
  readonly VITE_SIMULATE_LAPS?: string
}
