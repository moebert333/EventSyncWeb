import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'

function errorMessage(error: unknown): { title: string; detail?: string } {
  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return { title: 'Page not found', detail: error.statusText || 'That route does not exist.' }
    }
    return {
      title: `Something went wrong (${error.status})`,
      detail: error.statusText || (typeof error.data === 'string' ? error.data : undefined),
    }
  }
  if (error instanceof Error) {
    return { title: 'Something went wrong', detail: error.message }
  }
  return { title: 'Something went wrong' }
}

export function RouteErrorPage() {
  const error = useRouteError()
  const { title, detail } = errorMessage(error)

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col justify-center px-4 py-10">
      <div className="panel max-w-lg" role="alert">
        <p className="font-display text-3xl font-extrabold uppercase tracking-tight">{title}</p>
        {detail ? <p className="mt-3 text-[var(--muted)]">{detail}</p> : null}
        {import.meta.env.DEV && error instanceof Error && error.stack ? (
          <pre className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-[var(--muted)]">
            {error.stack}
          </pre>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/" className="btn">
            Go home
          </Link>
          <button type="button" className="btn btn-ghost" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    </div>
  )
}
