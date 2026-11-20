import { CalendarDays, Search, Settings2, UserRound, WifiOff } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { currentSession } from '@/auth'
import { cn } from '@/lib/utils'

const nav = [
  { to: '/', label: 'Plan', icon: CalendarDays },
  { to: '/courses', label: 'Kurse', icon: Search },
  // Only hidden for others; the backend refuses them anyway (ADR 0006).
  { to: '/admin', label: 'Verwaltung', icon: Settings2, roles: ['admin', 'lecturer'] },
  { to: '/account', label: 'Konto', icon: UserRound },
]

const subscribeOnline = (onChange: () => void) => {
  addEventListener('online', onChange)
  addEventListener('offline', onChange)
  return () => {
    removeEventListener('online', onChange)
    removeEventListener('offline', onChange)
  }
}

export default function App() {
  const roles = currentSession()?.roles ?? []
  // Tables in the admin area need the width of a desktop screen (#20).
  const wide = useLocation().pathname.startsWith('/admin')
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine)
  return (
    <div className={cn('mx-auto flex min-h-dvh flex-col', wide ? 'max-w-6xl' : 'max-w-2xl')}>
      <header className="sticky top-0 z-10 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-semibold">SPLAN Mobile</h1>
      </header>

      {!online && (
        <p role="status" className="flex items-center gap-2 border-b bg-muted px-4 py-2 text-sm">
          <WifiOff aria-hidden className="size-4 shrink-0" />
          Keine Verbindung. Änderungen und neue Daten gibt es wieder, sobald du online bist.
        </p>
      )}

      <main className="flex-1 px-4 py-4 pb-24">
        <Outlet />
      </main>

      <nav
        aria-label="Hauptnavigation"
        className="fixed inset-x-0 bottom-0 border-t bg-background pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto flex max-w-2xl">
          {nav
            .filter((item) => !item.roles || item.roles.some((r) => roles.includes(r)))
            .map(({ to, label, icon: Icon }) => (
              <li key={to} className="flex-1">
                <NavLink
                  to={to}
                  end
                  className={({ isActive }) =>
                    cn(
                      'flex flex-col items-center gap-1 py-2 text-xs text-muted-foreground',
                      isActive && 'font-medium text-foreground',
                    )
                  }
                >
                  <Icon aria-hidden className="size-5" />
                  {label}
                </NavLink>
              </li>
            ))}
        </ul>
      </nav>
    </div>
  )
}
