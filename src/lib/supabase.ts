import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const hasSupabaseEnv = Boolean(url && key)

// Anon SELECT is not limited to one organization. The UI filters by the
// Event Code context after resolution. See sql/PolicyAuthAllTables.sql.
export const supabase = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
