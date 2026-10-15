import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { QrCode } from '../../components/QrCode'
import { Skeleton } from '../../components/Skeleton'
import { useAdminSession } from '../../hooks/useAdminSession'
import { claimedOrganizationIds, fetchAllowlist, isPlatformAdmin } from '../../lib/adminAccess'
import { friendlyClaimError, friendlyCodeError, generateEventCode } from '../../lib/codes'
import { formatEventDate } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { EventCodeRow, EventRow, Organization, Series } from '../../types/database'

function ClaimForm() {
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const { error: claimError } = await supabase.rpc('claim_organization', { p_code: code.trim() })
    setPending(false)
    if (claimError) {
      setError(friendlyClaimError(claimError.message))
      return
    }
    setCode('')
    await queryClient.invalidateQueries({ queryKey: ['allowlist'] })
    await queryClient.invalidateQueries({ queryKey: ['admin-orgs'] })
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <label className="text-sm uppercase tracking-wide text-zinc-400" htmlFor="claim-code">
        Claim code
        <input
          id="claim-code"
          className="control mt-1"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="off"
          required
        />
      </label>
      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn w-fit" disabled={pending}>
        {pending ? 'Claiming…' : 'Claim organization'}
      </button>
    </form>
  )
}

export function OrganizationAdminPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const sessionQuery = useAdminSession()
  const allowlistQuery = useQuery({
    queryKey: ['allowlist'],
    queryFn: fetchAllowlist,
  })

  const rows = allowlistQuery.data ?? []
  const platform = isPlatformAdmin(rows)
  const claimedIds = claimedOrganizationIds(rows)
  const orgKey = platform ? 'platform' : claimedIds.join(',')

  const orgsQuery = useQuery({
    queryKey: ['admin-orgs', orgKey],
    enabled: allowlistQuery.isSuccess && (platform || claimedIds.length > 0),
    queryFn: async (): Promise<Organization[]> => {
      let query = supabase.from('organizations').select('organization_id, name, description').order('name')
      if (!platform) query = query.in('organization_id', claimedIds)
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as Organization[]
    },
  })

  const [orgId, setOrgId] = useState<number | null>(null)
  const [seriesId, setSeriesId] = useState<number | null>(null)
  const [eventId, setEventId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [codeDraft, setCodeDraft] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [formOrgId, setFormOrgId] = useState<number | null>(null)
  const [codeKey, setCodeKey] = useState<string | null>(null)

  const orgs = orgsQuery.data ?? []
  const selectedOrg = orgs.find((org) => org.organization_id === orgId) ?? orgs[0] ?? null

  const seriesQuery = useQuery({
    queryKey: ['admin-series', selectedOrg?.organization_id],
    enabled: selectedOrg != null,
    queryFn: async (): Promise<Series[]> => {
      const { data, error } = await supabase
        .from('series')
        .select('series_id, organization_id, name, description')
        .eq('organization_id', selectedOrg!.organization_id)
        .order('name')
      if (error) throw error
      return (data ?? []) as Series[]
    },
  })

  const seriesRows = seriesQuery.data ?? []
  const selectedSeries = seriesRows.find((series) => series.series_id === seriesId) ?? seriesRows[0] ?? null

  const eventsQuery = useQuery({
    queryKey: ['admin-events', selectedSeries?.series_id],
    enabled: selectedSeries != null,
    queryFn: async (): Promise<EventRow[]> => {
      const { data, error } = await supabase
        .from('events')
        .select('event_id, series_id, name, description, date, track, location')
        .eq('series_id', selectedSeries!.series_id)
        .order('date', { ascending: false })
      if (error) throw error
      return (data ?? []) as EventRow[]
    },
  })

  const eventRows = eventsQuery.data ?? []
  const selectedEvent = eventRows.find((event) => event.event_id === eventId) ?? eventRows[0] ?? null

  const codeQuery = useQuery({
    queryKey: ['admin-event-code', selectedEvent?.event_id],
    enabled: selectedEvent != null,
    queryFn: async (): Promise<EventCodeRow | null> => {
      const { data, error } = await supabase
        .from('event_codes')
        .select('event_id, code')
        .eq('event_id', selectedEvent!.event_id)
        .maybeSingle()
      if (error) throw error
      return (data as EventCodeRow | null) ?? null
    },
  })

  const saveOrg = useMutation({
    mutationFn: async () => {
      if (!selectedOrg) throw new Error('Choose an organization.')
      const trimmed = name.trim()
      if (!trimmed) throw new Error('Organization name is required.')
      const { error } = await supabase
        .from('organizations')
        .update({ name: trimmed, description: description.trim() ? description.trim() : null })
        .eq('organization_id', selectedOrg.organization_id)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-orgs'] })
    },
  })

  const saveCode = useMutation({
    mutationFn: async () => {
      if (!selectedEvent) throw new Error('Choose an event.')
      const next = codeDraft.trim().toUpperCase()
      if (next.length < 6 || next.length > 12) throw new Error('Event Codes are 6–12 characters.')
      const existing = codeQuery.data
      const write = existing
        ? supabase.from('event_codes').update({ code: next }).eq('event_id', selectedEvent.event_id)
        : supabase.from('event_codes').insert({ event_id: selectedEvent.event_id, code: next })
      const { error } = await write
      if (error) throw error
    },
    onSuccess: async () => {
      setCodeError(null)
      await queryClient.invalidateQueries({ queryKey: ['admin-event-code', selectedEvent?.event_id] })
    },
    onError: (err: Error) => {
      const code = 'code' in err ? String((err as { code?: string }).code ?? '') : ''
      setCodeError(friendlyCodeError(code, err.message))
    },
  })

  useEffect(() => {
    if (!allowlistQuery.isSuccess || !sessionQuery.data) return
    const active = (allowlistQuery.data ?? []).some((row) => row.is_active)
    if (!active) {
      void supabase.auth.signOut().then(() => {
        navigate('/admin?denied=1', { replace: true })
      })
    }
  }, [allowlistQuery.isSuccess, allowlistQuery.data, navigate, sessionQuery.data])

  if (selectedOrg && formOrgId !== selectedOrg.organization_id) {
    setFormOrgId(selectedOrg.organization_id)
    setOrgId(selectedOrg.organization_id)
    setName(selectedOrg.name)
    setDescription(selectedOrg.description ?? '')
  }

  if (selectedEvent && codeQuery.isSuccess) {
    const loadedCode = codeQuery.data?.code ?? ''
    const nextKey = `${selectedEvent.event_id}:${loadedCode}`
    if (codeKey !== nextKey) {
      setCodeKey(nextKey)
      setCodeDraft(loadedCode || generateEventCode())
      setCodeError(null)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    queryClient.clear()
    navigate('/admin', { replace: true })
  }

  if (allowlistQuery.isLoading || sessionQuery.isLoading || orgsQuery.isLoading) return <Skeleton rows={8} />

  if (allowlistQuery.error) {
    return (
      <div className="panel" role="alert">
        <p>{allowlistQuery.error instanceof Error ? allowlistQuery.error.message : 'Could not load admin access.'}</p>
        <button type="button" className="btn mt-4" onClick={() => void allowlistQuery.refetch()}>
          Retry
        </button>
      </div>
    )
  }

  const activeCount = rows.filter((row) => row.is_active).length
  if (activeCount === 0) {
    return (
      <p role="alert" className="text-lg">
        This email is not authorized to manage events
      </p>
    )
  }

  if (!platform && claimedIds.length === 0) {
    return (
      <section className="panel">
        <h1 className="font-display text-4xl font-extrabold uppercase">Claim organization</h1>
        <p className="mt-3 text-zinc-300">
          Enter the claim code for your organization. You can set Event Codes after the claim.
        </p>
        <div className="mt-5">
          <ClaimForm />
        </div>
      </section>
    )
  }

  const savedCode = codeQuery.data?.code ?? null
  const qrValue = savedCode ? `${window.location.origin}/?code=${encodeURIComponent(savedCode)}` : null
  const localhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-extrabold uppercase">Organization</h1>
          <p className="text-sm text-zinc-400">{sessionQuery.data?.user.email}</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>

      {orgs.length > 1 ? (
        <label className="block text-sm uppercase tracking-wide text-zinc-400">
          Organization
          <select
            className="control mt-1"
            value={selectedOrg?.organization_id ?? ''}
            onChange={(event) => {
              setOrgId(Number(event.target.value))
              setSeriesId(null)
              setEventId(null)
            }}
          >
            {orgs.map((org) => (
              <option key={org.organization_id} value={org.organization_id}>
                {org.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <form
        className="panel grid gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          saveOrg.mutate()
        }}
      >
        <h2 className="font-display text-2xl font-bold uppercase">Name and description</h2>
        <label className="text-sm uppercase tracking-wide text-zinc-400">
          Name
          <input className="control mt-1" value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label className="text-sm uppercase tracking-wide text-zinc-400">
          Description
          <textarea
            className="control mt-1 min-h-24"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        {saveOrg.error ? (
          <p className="text-sm text-red-400" role="alert">
            {saveOrg.error.message}
          </p>
        ) : null}
        {saveOrg.isSuccess ? <p className="text-sm text-[#f5c518]">Organization saved.</p> : null}
        <button type="submit" className="btn w-fit" disabled={saveOrg.isPending || !selectedOrg}>
          Save organization
        </button>
      </form>

      <section className="panel grid gap-3">
        <h2 className="font-display text-2xl font-bold uppercase">Series</h2>
        <p className="text-sm text-zinc-400">The track timing system creates series and events.</p>
        {seriesQuery.isLoading ? <Skeleton rows={2} /> : null}
        {seriesRows.length === 0 && !seriesQuery.isLoading ? <p>No series for this organization yet.</p> : null}
        {seriesRows.length > 0 ? (
          <label className="text-sm uppercase tracking-wide text-zinc-400">
            Series
            <select
              className="control mt-1"
              value={selectedSeries?.series_id ?? ''}
              onChange={(event) => {
                setSeriesId(Number(event.target.value))
                setEventId(null)
              }}
            >
              {seriesRows.map((series) => (
                <option key={series.series_id} value={series.series_id}>
                  {series.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {selectedSeries?.description ? <p className="text-zinc-300">{selectedSeries.description}</p> : null}
      </section>

      <section className="panel grid gap-3">
        <h2 className="font-display text-2xl font-bold uppercase">Events</h2>
        {eventsQuery.isLoading ? <Skeleton rows={2} /> : null}
        {selectedSeries && eventRows.length === 0 && !eventsQuery.isLoading ? <p>No events in this series yet.</p> : null}
        {eventRows.length > 0 ? (
          <label className="text-sm uppercase tracking-wide text-zinc-400">
            Event
            <select
              className="control mt-1"
              value={selectedEvent?.event_id ?? ''}
              onChange={(event) => setEventId(Number(event.target.value))}
            >
              {eventRows.map((event) => (
                <option key={event.event_id} value={event.event_id}>
                  {event.name}
                  {formatEventDate(event.date) ? ` · ${formatEventDate(event.date)}` : ''}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {selectedEvent ? (
          <dl className="grid gap-1 text-sm text-zinc-300">
            <div>
              <dt className="inline text-zinc-500">Date </dt>
              <dd className="inline">{formatEventDate(selectedEvent.date) ?? '—'}</dd>
            </div>
            <div>
              <dt className="inline text-zinc-500">Track </dt>
              <dd className="inline">{selectedEvent.track || '—'}</dd>
            </div>
            <div>
              <dt className="inline text-zinc-500">Location </dt>
              <dd className="inline">{selectedEvent.location || '—'}</dd>
            </div>
            {selectedEvent.description ? <p>{selectedEvent.description}</p> : null}
          </dl>
        ) : null}
      </section>

      <form
        className="panel grid gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          setCodeError(null)
          saveCode.mutate()
        }}
      >
        <h2 className="font-display text-2xl font-bold uppercase">Event Code</h2>
        <label className="text-sm uppercase tracking-wide text-zinc-400">
          Code
          <input
            className="control mt-1 uppercase"
            value={codeDraft}
            maxLength={12}
            onChange={(event) => setCodeDraft(event.target.value.toUpperCase())}
            disabled={!selectedEvent}
          />
        </label>
        <button
          type="button"
          className="btn btn-ghost w-fit"
          onClick={() => setCodeDraft(generateEventCode())}
          disabled={!selectedEvent}
        >
          New random code
        </button>
        {codeError ? (
          <p className="text-sm text-red-400" role="alert">
            {codeError}
          </p>
        ) : null}
        {saveCode.isSuccess && !codeError ? <p className="text-sm text-[#f5c518]">Event Code saved.</p> : null}
        <button type="submit" className="btn w-fit" disabled={saveCode.isPending || !selectedEvent}>
          Save Event Code
        </button>
      </form>

      <section className="panel">
        <h2 className="font-display text-2xl font-bold uppercase">QR</h2>
        {qrValue ? (
          <div className="mt-4 grid gap-3">
            <QrCode value={qrValue} />
            <p className="break-all text-sm text-zinc-400">{qrValue}</p>
            {localhost ? (
              <p className="text-sm text-[#ff6a00]">This QR uses localhost. Print it after the site is on HTTPS.</p>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-zinc-400">Save an Event Code to print its QR.</p>
        )}
      </section>

      <section className="panel">
        <h2 className="font-display text-2xl font-bold uppercase">Claim another organization</h2>
        <div className="mt-4">
          <ClaimForm />
        </div>
      </section>
    </div>
  )
}
