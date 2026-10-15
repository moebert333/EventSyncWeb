import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { AdminFrame } from './AdminFrame'

export function AdminLoginPage() {
  const [params] = useSearchParams()
  const denied = params.get('denied') === '1'
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/admin/callback` },
    })
    setPending(false)
    if (signInError) {
      setError(signInError.message)
      return
    }
    setSent(true)
  }

  return (
    <AdminFrame>
      <h1 className="font-display text-4xl font-extrabold uppercase">Sign in</h1>
      <p className="mt-3 max-w-lg text-zinc-300">
        The link expires. Check spam. There is no password.
      </p>
      {denied ? (
        <p className="mt-4 text-red-400" role="alert">
          This email is not authorized to manage events
        </p>
      ) : null}
      {sent ? (
        <p className="panel mt-6" role="status">
          Check your inbox
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 grid max-w-md gap-3">
          <label className="text-sm uppercase tracking-wide text-zinc-400" htmlFor="admin-email">
            Email
            <input
              id="admin-email"
              type="email"
              required
              autoComplete="email"
              className="control mt-1"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          {error ? (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn w-fit" disabled={pending}>
            {pending ? 'Sending…' : 'Email me a sign-in link'}
          </button>
        </form>
      )}
    </AdminFrame>
  )
}
