import { Outlet } from 'react-router-dom'
import { useSwipePageNav } from '../hooks/useSwipePageNav'
import { Footer } from './Footer'
import { Header } from './Header'
import { InstallAppBanner } from './InstallAppBanner'
import { OfflineBanner } from './OfflineBanner'
import { SimulationBanner } from './SimulationBanner'
import { SimulationProvider } from './SimulationProvider'
import { StagingAlert } from './StagingAlert'

function AppShellChrome() {
  useSwipePageNav()
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <InstallAppBanner />
      <SimulationBanner />
      <OfflineBanner />
      <StagingAlert />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

export function AppShell() {
  return (
    <SimulationProvider>
      <AppShellChrome />
    </SimulationProvider>
  )
}
