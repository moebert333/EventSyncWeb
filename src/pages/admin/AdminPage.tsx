import { Skeleton } from '../../components/Skeleton'
import { useAdminSession } from '../../hooks/useAdminSession'
import { AdminFrame } from './AdminFrame'
import { AdminLoginPage } from './AdminLoginPage'
import { OrganizationAdminPage } from './OrganizationAdminPage'

export function AdminPage() {
  const session = useAdminSession()

  if (session.isLoading) {
    return (
      <AdminFrame>
        <Skeleton rows={4} />
      </AdminFrame>
    )
  }

  if (session.error) {
    return (
      <AdminFrame>
        <p role="alert">{session.error instanceof Error ? session.error.message : 'Could not read the session.'}</p>
        <button type="button" className="btn mt-4" onClick={() => void session.refetch()}>
          Retry
        </button>
      </AdminFrame>
    )
  }

  if (!session.data) return <AdminLoginPage />
  return (
    <AdminFrame>
      <OrganizationAdminPage />
    </AdminFrame>
  )
}
