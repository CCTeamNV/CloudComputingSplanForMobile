import { CircleX, MapPinned } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getLecturerCourses, updateSession, upcomingSessions, type Session } from '@/api/lecturer'
import { berlinDay, berlinTime, type PublicSession } from '@/api/schedule'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const dayTitle = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const asDate = (day: string) => new Date(`${day}T12:00:00Z`)
const keyOf = (s: PublicSession) => `${s.courseId}/${s.id}`

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ok'; courses: number; sessions: PublicSession[] }

function SessionRow({ s, onSaved }: { s: PublicSession & { note?: string | null }; onSaved: (s: Session) => void }) {
  const [mode, setMode] = useState<'view' | 'cancel' | 'room'>('view')
  const [note, setNote] = useState('')
  const [room, setRoom] = useState(s.room)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (patch: Parameters<typeof updateSession>[1]) => {
    setBusy(true)
    setError(null)
    try {
      onSaved(await updateSession(s, patch))
      setMode('view')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className={cn('space-y-2 rounded-lg border p-3', s.cancelled && 'border-destructive/60 bg-destructive/5')}>
      <div>
        <p className="text-sm text-muted-foreground">
          {berlinTime(s.start)} – {berlinTime(s.end)}
        </p>
        <p className={cn('font-medium', s.cancelled && 'line-through')}>{s.courseName}</p>
        {s.cancelled ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
            <CircleX aria-hidden className="size-4 shrink-0" />
            Abgesagt{s.note && <span className="font-normal text-muted-foreground">: {s.note}</span>}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-sm">
            {s.originalRoom && <MapPinned aria-hidden className="size-4 shrink-0" />}
            Raum {s.room}
            {s.originalRoom && <span className="text-muted-foreground">, vorher {s.originalRoom}</span>}
          </p>
        )}
      </div>

      {mode === 'cancel' && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            void save({ cancelled: true, note: note.trim() || null })
          }}
        >
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">Hinweis (optional, nur für dich und Admins sichtbar)</span>
            <input
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              className="block w-full rounded-md border bg-background px-3 py-2"
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="destructive" disabled={busy}>
              Absage bestätigen
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode('view')}>
              Abbrechen
            </Button>
          </div>
        </form>
      )}

      {mode === 'room' && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            void save({ room: room.trim() })
          }}
        >
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">Neuer Raum</span>
            <input
              value={room}
              required
              maxLength={40}
              autoFocus
              onChange={(e) => setRoom(e.target.value)}
              className="block w-full rounded-md border bg-background px-3 py-2"
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy || !room.trim() || room.trim() === s.room}>
              Raum speichern
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode('view')}>
              Abbrechen
            </Button>
          </div>
        </form>
      )}

      {mode === 'view' && (
        <div className="flex flex-wrap gap-2">
          {s.cancelled ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void save({ cancelled: false, note: null })}
            >
              Absage zurücknehmen
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => setMode('cancel')}>
                Absagen
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMode('room')}>
                Raum ändern
              </Button>
            </>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </li>
  )
}

export default function LecturerSessions() {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [reload, setReload] = useState(0)
  // Saved changes win over the files until the files catch up (stream + cache, about 2 min).
  const [saved, setSaved] = useState<Record<string, Session>>({})

  useEffect(() => {
    const now = new Date()
    getLecturerCourses()
      .then(async (courses) => ({ courses: courses.length, sessions: await upcomingSessions(courses, now) }))
      .then(({ courses, sessions }) => setLoad({ state: 'ok', courses, sessions }))
      .catch(() => setLoad({ state: 'error' }))
  }, [reload])

  if (load.state === 'loading') {
    return (
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Lädt …
      </p>
    )
  }
  if (load.state === 'error') {
    return (
      <div role="alert" className="space-y-2 rounded-md border p-4 text-sm">
        <p>Deine Termine konnten nicht geladen werden.</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setLoad({ state: 'loading' })
            setReload((n) => n + 1)
          }}
        >
          Erneut versuchen
        </Button>
      </div>
    )
  }
  if (load.courses === 0) {
    return <p className="text-sm text-muted-foreground">Dir sind noch keine Kurse zugeordnet. Das macht ein Admin.</p>
  }

  const sessions = load.sessions.map((s) => saved[keyOf(s)] ?? s)
  const days = [...new Set(sessions.map((s) => berlinDay(s.start)))]
  return sessions.length === 0 ? (
    <p className="text-sm text-muted-foreground">In den nächsten 14 Tagen hast du keine Termine.</p>
  ) : (
    <div className="space-y-4">
      {days.map((d) => (
        <div key={d}>
          <h4 className="mb-2 text-sm font-medium">{dayTitle.format(asDate(d))}</h4>
          <ul className="space-y-2">
            {sessions
              .filter((s) => berlinDay(s.start) === d)
              .map((s) => (
                <SessionRow key={keyOf(s)} s={s} onSaved={(next) => setSaved((m) => ({ ...m, [keyOf(next)]: next }))} />
              ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
