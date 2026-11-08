import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useEventCode } from './useEventCode'

function sameCode(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0
}

/**
 * Applies `?code=` from the URL (same as typing an Event Code on Home).
 * Safe to call from any page — submits at most once per distinct code value.
 */
export function useEventCodeQueryParam() {
  const [params] = useSearchParams()
  const { submitCode, context, resolving, error } = useEventCode()
  const code = params.get('code')?.trim() || null
  const attempted = useRef<string | null>(null)

  useEffect(() => {
    if (!code) return
    if (context && sameCode(context.code, code)) {
      attempted.current = code
      return
    }
    if (attempted.current === code) return
    attempted.current = code
    void submitCode(code)
  }, [code, context, submitCode])

  const matched = Boolean(context && code && sameCode(context.code, code))
  const applying =
    code != null &&
    !matched &&
    (resolving || attempted.current !== code || (attempted.current === code && error == null && !context))
  const failed = Boolean(code && attempted.current === code && !resolving && !matched && error)

  return { code, applying, failed, matched }
}
