import { Outlet } from 'react-router-dom'
import { Footer } from './Footer'
import { Header } from './Header'
import { OfflineBanner } from './OfflineBanner'
import { SimulationBanner } from './SimulationBanner'
import { SimulationProvider } from './SimulationProvider'
import { StagingAlert } from './StagingAlert'

export function AppShell() {
  return (
    <SimulationProvider>
      <div className="flex min-h-dvh flex-col">
        <Header />
        <SimulationBanner />
        <OfflineBanner />
        <StagingAlert />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          <Outlet />
        </main>
        <Footer />
      </div>
    </SimulationProvider>
  )
}
