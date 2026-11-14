import { CalendarPlus, Copy } from 'lucide-react'
import { useRef, useState } from 'react'
import { apiFetch, appConfig } from '@/api/client'
import { copyText, revokeIcalUrl, rotateIcalUrl, storedIcalUrl, webcalUrl } from '@/api/ical'
import { currentSession, logout } from '@/auth'
import { Button } from '@/components/ui/button'

const roleLabel: Record<string, string> = { admin: 'Admin', lecturer: 'Dozent/in' }

function CalendarSection() {
  const [url, setUrl] = useState(storedIcalUrl)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setNotice(null)
    try {
      await action()
    } catch {
      setNotice({ text: 'Das hat nicht geklappt. Bitte versuche es noch einmal.', error: true })
    } finally {
      setBusy(false)
    }
  }

  const create = () =>
    run(async () => {
      setUrl(await rotateIcalUrl())
      setNotice({ text: 'Dein Kalender-Link ist bereit. Kopiere ihn in deine Kalender-App.' })
    })

  const renew = () => {
    const ok = window.confirm(
      'Neuen Link erzeugen?\n\nDer bisherige Link funktioniert danach nicht mehr. Kalender, die ihn abonniert haben, musst du mit dem neuen Link neu einrichten.',
    )
    if (!ok) return
    void run(async () => {
      setUrl(await rotateIcalUrl())
      setNotice({
        text: 'Neuer Link erstellt. Der alte funktioniert nicht mehr: Entferne das alte Abo in deinen Kalender-Apps und trage den neuen Link ein.',
      })
    })
  }

  const revoke = () => {
    if (!window.confirm('Kalender-Link widerrufen?\n\nAbonnierte Kalender erhalten danach keine Termine mehr.')) return
    void run(async () => {
      await revokeIcalUrl()
      setUrl(null)
      setNotice({ text: 'Der Kalender-Link ist widerrufen.' })
    })
  }

  const copy = async () => {
    const ok = url ? await copyText(url, input.current) : false
    setNotice(
      ok
        ? { text: 'Link kopiert.' }
        : { text: 'Kopieren ging nicht. Markiere den Link und kopiere ihn von Hand.', error: true },
    )
  }

  return (
    <div className="space-y-3 border-t pt-6">
      <h3 className="font-medium">Kalender-Abo</h3>
      <p className="text-sm text-muted-foreground">
        Dein Plan als Abo für Google, Apple oder Outlook Kalender, inklusive Ausfällen und Raumänderungen. Der Link ist
        geheim: Wer ihn kennt, sieht deinen Plan. Kalender-Apps aktualisieren ihn meist alle paar Stunden.
      </p>
      {url ? (
        <>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">Dein Kalender-Link</span>
            <input
              ref={input}
              readOnly
              value={url}
              onFocus={(e) => e.target.select()}
              className="block w-full rounded-md border bg-muted px-3 py-2 font-mono text-xs"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => void copy()}>
              <Copy aria-hidden />
              Link kopieren
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={webcalUrl(url)}>
                <CalendarPlus aria-hidden />
                In Kalender öffnen
              </a>
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={renew}>
              Neu erzeugen
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={revoke}>
              Widerrufen
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Hast du schon auf einem anderen Gerät einen Link erstellt, wird er durch einen neuen ungültig.
          </p>
          <Button size="sm" disabled={busy} onClick={() => void create()}>
            <CalendarPlus aria-hidden />
            Kalender-Link erstellen
          </Button>
        </>
      )}
      {notice && (
        <p role={notice.error ? 'alert' : 'status'} className={notice.error ? 'text-sm text-destructive' : 'text-sm'}>
          {notice.text}
        </p>
      )}
    </div>
  )
}

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
      <CalendarSection />
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
