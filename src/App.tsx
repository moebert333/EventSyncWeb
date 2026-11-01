import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { hasSupabaseEnv } from './lib/supabase'
import { AdminCallbackPage } from './pages/admin/AdminCallbackPage'
import { AdminPage } from './pages/admin/AdminPage'
import { CompletedRacesPage } from './pages/CompletedRacesPage'
import { LiveStreamPage } from './pages/future/LiveStreamPage'
import { HomePage } from './pages/HomePage'
import { RaceOrderPage } from './pages/RaceOrderPage'
import { RacesInProgressPage } from './pages/RacesInProgressPage'

export default function App() {
  if (!hasSupabaseEnv) {
    return (
      <p className="p-8">
        Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to .env.local, then restart the dev server.
      </p>
    )
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/order" element={<RaceOrderPage />} />
        <Route path="/live" element={<RacesInProgressPage />} />
        <Route path="/results" element={<CompletedRacesPage />} />
        <Route path="/stream" element={<LiveStreamPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
      <Route path="/admin/callback" element={<AdminCallbackPage />} />
      <Route path="/admin" element={<AdminPage />} />
    </Routes>
  )
}
