import { useEffect, useState } from 'react'
import { berlinInstant, createSessions, deleteSessionAdmin, updateSessionAdmin, type SessionInput } from '@/api/admin'
import { catalogFile, type PublicCourse } from '@/api/catalog'
import { berlinDay, berlinTime, type PublicSession } from '@/api/schedule'
import { Button } from '@/components/ui/button'
import { field } from './AdminCourses'

const KINDS: Record<SessionInput['kind'] & string, string> = {
  lecture: 'Vorlesung',
  lab: 'Labor',
  exercise: 'Übung',
  exam: 'Prüfung',
}
const dateFormat = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
})

type Draft = { day: string; from: string; to: string; room: string; kind: SessionInput['kind'] & string }
const draftOf = (s: PublicSession): Draft => ({
  day: berlinDay(s.start),
  from: berlinTime(s.start),
  to: berlinTime(s.end),
  room: s.room,
  kind: s.kind ?? 'lecture',
})
const inputOf = (d: Draft): SessionInput => ({
  start: berlinInstant(d.day, d.from),
  end: berlinInstant(d.day, d.to),
  room: d.room.trim(),
  kind: d.kind,
})

/** Date, times, room, kind; shared by "add" and "edit". */
function DraftFields({ d, set }: { d: Draft; set: (d: Draft) => void }) {
  return (
    <>
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">Datum</span>
        <input
          type="date"
          required
          value={d.day}
          onChange={(e) => set({ ...d, day: e.target.value })}
          className={field}
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">Von</span>
        <input
          type="time"
          required
          value={d.from}
          onChange={(e) => set({ ...d, from: e.target.value })}
          className={field}
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">Bis</span>
        <input
          type="time"
          required
          value={d.to}
          onChange={(e) => set({ ...d, to: e.target.value })}
          className={field}
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">Raum</span>
        <input
          required
          maxLength={40}
          value={d.room}
          onChange={(e) => set({ ...d, room: e.target.value })}
          className={field}
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">Art</span>
        <select value={d.kind} onChange={(e) => set({ ...d, kind: e.target.value as Draft['kind'] })} className={field}>
          {Object.entries(KINDS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </>
  )
}

/** Client-side check against SessionInput, so most mistakes never reach the backend. */
const problem = (d: Draft): string | null => (d.to <= d.from ? 'Das Ende muss nach dem Beginn liegen.' : null)

export default function AdminSessions({ course }: { course: PublicCourse }) {
  const [files, setFiles] = useState<PublicSession[] | 'loading' | 'error'>('loading')
  // Saved changes win over the file until it catches up (about 2 min); null = deleted.
  const [changed, setChanged] = useState<Record<string, PublicSession | null>>({})
  const [draft, setDraft] = useState<Draft>({ day: '', from: '08:00', to: '09:30', room: '', kind: 'lecture' })
  const [weeks, setWeeks] = useState(14)
  const [editing, setEditing] = useState<{ id: string; d: Draft } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    catalogFile<PublicSession[]>(`sessions/${course.id}.json`)
      .then(setFiles)
      .catch(() => setFiles('error'))
  }, [course.id, reload])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setMessage(null)
    try {
      await action()
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const add = () =>
    run(async () => {
      const created = await createSessions(course.id, { ...inputOf(draft), repeatWeeks: weeks })
      setChanged((m) => ({ ...m, ...Object.fromEntries(created.map((s) => [s.id, s])) }))
      setMessage(`${created.length} Termin${created.length === 1 ? '' : 'e'} angelegt.`)
    })
  const save = (id: string, d: Draft) =>
    run(async () => {
      const s = await updateSessionAdmin(course.id, id, inputOf(d))
      setChanged((m) => ({ ...m, [id]: null, [s.id]: s })) // a new start gives a new id
      setEditing(null)
    })
  const remove = (id: string) =>
    run(async () => {
      await deleteSessionAdmin(course.id, id)
      setChanged((m) => ({ ...m, [id]: null }))
      setConfirmDelete(null)
    })

  const list = [
    ...(Array.isArray(files) ? files.filter((s) => !(s.id in changed)) : []),
    ...Object.values(changed).filter((s): s is PublicSession => !!s),
  ].sort((a, b) => a.start.localeCompare(b.start))

  return (
    <section aria-labelledby="sessions-heading" className="space-y-4 rounded-lg border p-4">
      <h4 id="sessions-heading" className="font-medium">
        Termine: {course.name}
      </h4>

      <form
        className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault()
          const p = problem(draft)
          if (p) return setMessage(p)
          void add()
        }}
      >
        <DraftFields d={draft} set={setDraft} />
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Wöchentlich, Anzahl</span>
          <input
            type="number"
            required
            min={1}
            max={20}
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
            className={field}
          />
        </label>
        <div className="sm:col-span-3 lg:col-span-6">
          <Button type="submit" disabled={busy}>
            {weeks > 1 ? `${weeks} Termine anlegen` : 'Termin anlegen'}
          </Button>
        </div>
      </form>

      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}

      {files === 'loading' ? (
        <p className="text-sm text-muted-foreground">Lädt …</p>
      ) : files === 'error' && list.length === 0 ? (
        <div className="space-y-2 text-sm">
          <p>Keine Termine geladen. Bei einem gerade angelegten Kurs erscheint die Datei nach etwa 2 Minuten.</p>
          <Button size="sm" variant="outline" onClick={() => setReload((n) => n + 1)}>
            Erneut laden
          </Button>
        </div>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Termine.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Termine von {course.name}</caption>
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pr-3 font-normal">Datum</th>
                <th className="py-2 pr-3 font-normal">Zeit</th>
                <th className="py-2 pr-3 font-normal">Raum</th>
                <th className="py-2 pr-3 font-normal">Art</th>
                <th className="py-2 pr-3 font-normal">Status</th>
                <th className="py-2 font-normal">
                  <span className="sr-only">Aktionen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) =>
                editing?.id === s.id ? (
                  <tr key={s.id} className="border-b">
                    <td colSpan={6} className="py-2">
                      <form
                        className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5"
                        onSubmit={(e) => {
                          e.preventDefault()
                          const p = problem(editing.d)
                          if (p) return setMessage(p)
                          void save(s.id, editing.d)
                        }}
                      >
                        <DraftFields d={editing.d} set={(d) => setEditing({ id: s.id, d })} />
                        <div className="flex gap-2 sm:col-span-3 lg:col-span-5">
                          <Button type="submit" size="sm" disabled={busy}>
                            Speichern
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                            Abbrechen
                          </Button>
                        </div>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={s.id} className="border-b">
                    <td className="py-2 pr-3">{dateFormat.format(new Date(`${berlinDay(s.start)}T12:00:00Z`))}</td>
                    <td className="py-2 pr-3">
                      {berlinTime(s.start)}–{berlinTime(s.end)}
                    </td>
                    <td className="py-2 pr-3">
                      {s.room}
                      {s.originalRoom && <span className="text-muted-foreground"> (vorher {s.originalRoom})</span>}
                    </td>
                    <td className="py-2 pr-3">{KINDS[s.kind ?? 'lecture']}</td>
                    <td className="py-2 pr-3">
                      {s.cancelled ? <span className="text-destructive">abgesagt</span> : ''}
                    </td>
                    <td className="py-2">
                      <div className="flex justify-end gap-1">
                        {confirmDelete === s.id ? (
                          <>
                            <Button size="sm" variant="destructive" disabled={busy} onClick={() => void remove(s.id)}>
                              Löschen bestätigen
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                              Abbrechen
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => setEditing({ id: s.id, d: draftOf(s) })}>
                              Bearbeiten
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(s.id)}>
                              Löschen
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
