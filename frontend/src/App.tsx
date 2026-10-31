import { CalendarDays, Search } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { cn } from '@/lib/utils'

const nav = [
  { to: '/', label: 'Plan', icon: CalendarDays },
  { to: '/courses', label: 'Kurse', icon: Search },
]

export default function App() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-semibold">SPLAN Mobile</h1>
      </header>

      <main className="flex-1 px-4 py-4 pb-24">
        <Outlet />
      </main>

      <nav
        aria-label="Hauptnavigation"
        className="fixed inset-x-0 bottom-0 border-t bg-background pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto flex max-w-2xl">
          {nav.map(({ to, label, icon: Icon }) => (
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
