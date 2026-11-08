/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
  /** When true, Points require every moto 1…max. Default / missing = false. */
  readonly VITE_REQUIRE_ALL_MOTOS?: string
}
