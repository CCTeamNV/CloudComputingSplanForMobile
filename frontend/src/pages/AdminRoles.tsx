import { useState } from 'react'
import { findUsers, setRoles, type Role, type User } from '@/api/admin'
import { Button } from '@/components/ui/button'
import { field } from './AdminCourses'

const ROLES: { role: Role; label: string }[] = [
  { role: 'lecturer', label: 'Dozent/in' },
  { role: 'admin', label: 'Admin' },
]

function UserRow({ user }: { user: User }) {
  const [roles, setLocal] = useState<Role[]>(user.roles)
  const [saved, setSaved] = useState<Role[]>(user.roles)
  const [message, setMessage] = useState<string | null>(null)
  const dirty = [...roles].sort().join() !== [...saved].sort().join()

  const save = async () => {
    setMessage(null)
    try {
      const u = await setRoles(user.id, roles)
      setSaved(u.roles)
      setMessage('Gespeichert, gilt ab der nächsten Anmeldung bzw. spätestens nach einer Stunde.')
    } catch (err) {
      setMessage((err as Error).message)
    }
  }

  return (
    <tr className="border-b">
      <td className="py-2 pr-3">{user.email}</td>
      {ROLES.map(({ role, label }) => (
        <td key={role} className="py-2 pr-3">
          <input
            type="checkbox"
            aria-label={`${label}: ${user.email}`}
            checked={roles.includes(role)}
            onChange={(e) => setLocal(e.target.checked ? [...roles, role] : roles.filter((r) => r !== role))}
            className="size-4"
          />
        </td>
      ))}
      <td className="py-2">
        <div className="flex items-center justify-end gap-2">
          {message && (
            <span role="status" className="text-xs text-muted-foreground">
              {message}
            </span>
          )}
          <Button size="sm" variant="outline" disabled={!dirty} onClick={() => void save()}>
            Speichern
          </Button>
        </div>
      </td>
    </tr>
  )
}

export default function AdminRoles() {
  const [email, setEmail] = useState('')
  const [users, setUsers] = useState<User[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          findUsers(email.trim())
            .then(setUsers)
            .catch((err: Error) => setError(err.message))
        }}
      >
        <label className="flex-1 text-sm">
          <span className="sr-only">E-Mail</span>
          <input
            type="search"
            placeholder="E-Mail-Anfang, mind. 3 Zeichen"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={field}
          />
        </label>
        <Button type="submit" variant="outline" disabled={email.trim().length < 3}>
          Suchen
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {users?.length === 0 && <p className="text-sm text-muted-foreground">Niemand gefunden.</p>}
      {!!users?.length && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Rollen</caption>
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pr-3 font-normal">E-Mail</th>
                {ROLES.map(({ role, label }) => (
                  <th key={role} className="py-2 pr-3 font-normal">
                    {label}
                  </th>
                ))}
                <th className="py-2 font-normal">
                  <span className="sr-only">Aktionen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow key={u.id} user={u} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
