import { Outlet } from 'react-router-dom'
import { LapProgressRecorder } from '../hooks/useLapProgress'
import { Footer } from './Footer'
import { Header } from './Header'
import { OfflineBanner } from './OfflineBanner'
import { StagingAlert } from './StagingAlert'

export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <OfflineBanner />
      <StagingAlert />
      <LapProgressRecorder />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
