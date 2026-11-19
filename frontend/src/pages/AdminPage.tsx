import { currentSession } from '@/auth'
import AdminCourses from './AdminCourses'
import AdminRoles from './AdminRoles'
import LecturerSessions from './LecturerSessions'

// Lazy chunk for lecturers and admins; what they may do is checked by the backend (ADR 0006).
export default function AdminPage() {
  const roles = currentSession()?.roles ?? []
  return (
    <section aria-labelledby="admin-heading" className="space-y-6">
      <h2 id="admin-heading" className="text-base font-medium">
        Verwaltung
      </h2>
      {roles.includes('lecturer') && (
        <div className="space-y-3">
          <h3 className="font-medium">Meine Termine</h3>
          <p className="text-sm text-muted-foreground">
            Absagen und Raumänderungen sehen Studierende nach etwa 2 Minuten in ihrem Plan und Kalender.
          </p>
          <LecturerSessions />
        </div>
      )}
      {roles.includes('admin') && (
        <>
          <div className="space-y-3">
            <h3 className="font-medium">Kurse und Termine</h3>
            <p className="text-sm text-muted-foreground">
              Änderungen erscheinen nach etwa 2 Minuten in den Plänen; hier siehst du sie sofort.
            </p>
            <AdminCourses />
          </div>
          <div className="space-y-3">
            <h3 className="font-medium">Rollen</h3>
            <AdminRoles />
          </div>
        </>
      )}
    </section>
  )
}
