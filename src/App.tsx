import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { RequireEventContext } from './components/RequireEventContext'
import { hasSupabaseEnv } from './lib/supabase'
import { AdminCallbackPage } from './pages/admin/AdminCallbackPage'
import { AdminPage } from './pages/admin/AdminPage'
import { CompletedRacesPage } from './pages/CompletedRacesPage'
import { LiveStreamPage } from './pages/future/LiveStreamPage'
import { HomePage } from './pages/HomePage'
import { RaceOrderPage } from './pages/RaceOrderPage'
import { RacesInProgressPage } from './pages/RacesInProgressPage'

function MissingEnv() {
  return (
    <p className="p-8">
      Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to .env.local, then restart the dev server.
    </p>
  )
}

export const router = createBrowserRouter(
  hasSupabaseEnv
    ? [
        {
          element: <AppShell />,
          children: [
            { path: '/', element: <HomePage /> },
            {
              path: '/order',
              element: (
                <RequireEventContext>
                  <RaceOrderPage />
                </RequireEventContext>
              ),
            },
            {
              path: '/live',
              element: (
                <RequireEventContext>
                  <RacesInProgressPage />
                </RequireEventContext>
              ),
            },
            {
              path: '/results',
              element: (
                <RequireEventContext>
                  <CompletedRacesPage />
                </RequireEventContext>
              ),
            },
            {
              path: '/stream',
              element: (
                <RequireEventContext>
                  <LiveStreamPage />
                </RequireEventContext>
              ),
            },
            { path: '*', element: <Navigate to="/" replace /> },
          ],
        },
        { path: '/admin/callback', element: <AdminCallbackPage /> },
        { path: '/admin', element: <AdminPage /> },
      ]
    : [{ path: '*', element: <MissingEnv /> }],
)
