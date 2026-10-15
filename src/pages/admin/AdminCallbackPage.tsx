import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Skeleton } from '../../components/Skeleton'
import { activeAllowlist, fetchAllowlist } from '../../lib/adminAccess'
import { supabase } from '../../lib/supabase'
import { AdminFrame } from './AdminFrame'

type CallbackState = { kind: 'working' } | { kind: 'denied' } | { kind: 'error'; message: string }

export function AdminCallbackPage() {
  const navigate = useNavigate()
  const [state, setState] = useState<CallbackState>({ kind: 'working' })

  useEffect(() => {
    let cancelled = false
    async function finish() {
      const params = new URLSearchParams(window.location.search)
      const description = params.get('error_description')
      if (description) throw new Error(description)

      const existing = await supabase.auth.getSession()
      if (existing.error) throw existing.error
      let session = existing.data.session
      const authCode = params.get('code')
      if (!session && authCode) {
        const exchanged = await supabase.auth.exchangeCodeForSession(authCode)
        if (exchanged.error) throw exchanged.error
        session = exchanged.data.session
      }
      if (!session) throw new Error('The sign-in link is invalid or expired.')

      const rows = await fetchAllowlist()
      if (cancelled) return
      if (activeAllowlist(rows).length === 0) {
        await supabase.auth.signOut()
        setState({ kind: 'denied' })
        return
      }
      navigate('/admin', { replace: true })
    }

    finish().catch((err: unknown) => {
      if (cancelled) return
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Sign-in failed.' })
    })
    return () => {
      cancelled = true
    }
  }, [navigate])

  return (
    <AdminFrame>
      {state.kind === 'working' ? (
        <>
          <h1 className="font-display text-4xl font-extrabold uppercase">Signing you in</h1>
          <div className="mt-6">
            <Skeleton rows={3} />
          </div>
        </>
      ) : null}
      {state.kind === 'denied' ? (
        <>
          <h1 className="font-display text-4xl font-extrabold uppercase">Not authorized</h1>
          <p className="mt-3" role="alert">
            This email is not authorized to manage events
          </p>
        </>
      ) : null}
      {state.kind === 'error' ? (
        <>
          <h1 className="font-display text-4xl font-extrabold uppercase">Sign-in failed</h1>
          <p className="mt-3 text-red-400" role="alert">
            {state.message}
          </p>
        </>
      ) : null}
    </AdminFrame>
  )
}
