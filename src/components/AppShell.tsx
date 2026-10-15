import { Outlet } from 'react-router-dom'
import { Footer } from './Footer'
import { Header } from './Header'
import { OfflineBanner } from './OfflineBanner'

export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <OfflineBanner />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
