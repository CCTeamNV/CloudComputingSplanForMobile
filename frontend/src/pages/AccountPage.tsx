import { useState } from 'react'
import { apiFetch, appConfig } from '@/api/client'
import { currentSession, logout } from '@/auth'
import { Button } from '@/components/ui/button'

const roleLabel: Record<string, string> = { admin: 'Admin', lecturer: 'Dozent/in' }

export default function AccountPage() {
  const session = currentSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const deleteAccount = async () => {
    const ok = window.confirm(
      'Account endgültig löschen?\n\nDeine Abos und dein Kalender-Link werden entfernt. Das lässt sich nicht rückgängig machen.',
    )
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      const res = await apiFetch('/me', { method: 'DELETE' })
      if (res.status !== 204) throw new Error(`HTTP ${res.status}`)
      await logout(appConfig(), false) // the user no longer exists, nothing left to revoke
    } catch {
      setError('Der Account konnte nicht gelöscht werden. Bitte versuche es später noch einmal.')
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="account-heading" className="space-y-6">
      <h2 id="account-heading" className="text-base font-medium">
        Konto
      </h2>
      <dl className="space-y-1 text-sm">
        <dt className="text-muted-foreground">Angemeldet als</dt>
        <dd className="font-medium break-all">{session?.email}</dd>
        <dt className="pt-2 text-muted-foreground">Rolle</dt>
        <dd>{session?.roles.map((r) => roleLabel[r] ?? r).join(', ') || 'Student/in'}</dd>
      </dl>
      <Button variant="outline" disabled={busy} onClick={() => void logout(appConfig())}>
        Abmelden
      </Button>
      <div className="space-y-2 border-t pt-6">
        <h3 className="font-medium">Account löschen</h3>
        <p className="text-sm text-muted-foreground">
          Entfernt dein Konto, deine Abos und deinen Kalender-Link. Danach wirst du abgemeldet.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button variant="destructive" disabled={busy} onClick={() => void deleteAccount()}>
          Account löschen
        </Button>
      </div>
    </section>
  )
}
