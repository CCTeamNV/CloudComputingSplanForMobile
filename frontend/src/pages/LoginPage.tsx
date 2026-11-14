import { useState } from 'react'
import { appConfig } from '@/api/client'
import { startLogin } from '@/auth'
import { Button } from '@/components/ui/button'

export default function LoginPage({ error }: { error: string | null }) {
  const [busy, setBusy] = useState(false)
  const go = (mode: 'login' | 'signup') => {
    setBusy(true)
    void startLogin(appConfig(), mode)
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">SPLAN Mobile</h1>
        <p className="text-muted-foreground">Dein Stundenplan der Hochschule Heilbronn, auf dem Handy.</p>
      </div>
      {error && (
        <p role="alert" className="rounded-md border border-destructive/50 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-3">
        <Button size="lg" disabled={busy} onClick={() => go('login')}>
          Anmelden
        </Button>
        <Button size="lg" variant="outline" disabled={busy} onClick={() => go('signup')}>
          Registrieren
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Registrierung nur mit deiner Hochschul-E-Mail-Adresse (@hs-heilbronn.de). Du bekommst einen Bestätigungscode per
        E-Mail.
      </p>
    </main>
  )
}
