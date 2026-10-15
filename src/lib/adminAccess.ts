import type { AllowlistRow } from '../types/database'
import { supabase } from './supabase'

export async function fetchAllowlist(): Promise<AllowlistRow[]> {
  const { data, error } = await supabase
    .from('admin_allowlist')
    .select('allowlist_id, email, organization_id, is_active, claimed_at')
  if (error) throw error
  return (data ?? []) as AllowlistRow[]
}

export function activeAllowlist(rows: AllowlistRow[]): AllowlistRow[] {
  return rows.filter((row) => row.is_active)
}

export function isPlatformAdmin(rows: AllowlistRow[]): boolean {
  return activeAllowlist(rows).some((row) => row.organization_id == null)
}

export function claimedOrganizationIds(rows: AllowlistRow[]): number[] {
  return activeAllowlist(rows)
    .filter((row) => row.claimed_at && row.organization_id != null)
    .map((row) => row.organization_id as number)
}
