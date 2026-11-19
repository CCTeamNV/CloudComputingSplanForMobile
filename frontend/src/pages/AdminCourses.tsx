import { useEffect, useState } from 'react'
import { createCourse, deleteCourse, findUsers, updateCourse, type CourseInput, type User } from '@/api/admin'
import { getCourses, getPrograms, type Program, type PublicCourse } from '@/api/catalog'
import { Button } from '@/components/ui/button'
import AdminSessions from './AdminSessions'

export const field = 'block w-full rounded-md border bg-background px-3 py-2'
type Load<T> = { state: 'loading' } | { state: 'error' } | { state: 'ok'; data: T }

/** Lecturer by email; only users with the role `lecturer` can be assigned (the backend checks it too). */
function LecturerPicker({ onPick }: { onPick: (u: User) => void }) {
  const [email, setEmail] = useState('')
  const [found, setFound] = useState<User[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const search = async () => {
    setError(null)
    try {
      setFound((await findUsers(email.trim())).filter((u) => u.roles.includes('lecturer')))
    } catch (err) {
      setError((err as Error).message)
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <label className="flex-1 text-sm">
          <span className="sr-only">E-Mail der Dozentin oder des Dozenten</span>
          <input
            type="search"
            placeholder="E-Mail-Anfang, mind. 3 Zeichen"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && email.trim().length >= 3) {
                e.preventDefault()
                void search()
              }
            }}
            className={field}
          />
        </label>
        <Button type="button" variant="outline" disabled={email.trim().length < 3} onClick={() => void search()}>
          Suchen
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {found && found.length === 0 && (
        <p className="text-sm text-muted-foreground">Keine Dozierenden gefunden. Rolle unter „Rollen“ vergeben.</p>
      )}
      {found?.map((u) => (
        <Button key={u.id} type="button" size="sm" variant="ghost" onClick={() => onPick(u)}>
          {u.email} zuordnen
        </Button>
      ))}
    </div>
  )
}

function CourseForm({
  course,
  programs,
  defaults,
  onSaved,
  onCancel,
}: {
  course?: PublicCourse
  programs: Program[]
  defaults: { programId: string; semester: number }
  onSaved: (c: PublicCourse) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(course?.name ?? '')
  const [shortName, setShortName] = useState(course?.shortName ?? '')
  const [programId, setProgramId] = useState(course?.programId ?? defaults.programId)
  const [semester, setSemester] = useState(course?.semester ?? defaults.semester)
  // undefined: lecturer unchanged, the backend keeps it (the files have no lecturerId).
  const [lecturer, setLecturer] = useState<{ id: string | null; name: string } | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const maxSemester = programs.find((p) => p.id === programId)?.semesters ?? 10

  const save = async () => {
    setBusy(true)
    setError(null)
    const input: CourseInput = { name: name.trim(), shortName: shortName.trim() || undefined, programId, semester }
    if (lecturer) Object.assign(input, { lecturerId: lecturer.id, lecturerName: lecturer.name.trim() || null })
    try {
      onSaved(await (course ? updateCourse(course.id, input) : createCourse(input)))
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  const lecturerName = lecturer ? lecturer.name : course?.lecturerName
  return (
    <form
      className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <h4 className="font-medium sm:col-span-2">{course ? `${course.name} bearbeiten` : 'Neuer Kurs'}</h4>
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">Name</span>
        <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className={field} />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">Kürzel (optional)</span>
        <input maxLength={20} value={shortName} onChange={(e) => setShortName(e.target.value)} className={field} />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">Studiengang</span>
        <select value={programId} onChange={(e) => setProgramId(e.target.value)} className={field}>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">Semester</span>
        <input
          type="number"
          required
          min={1}
          max={maxSemester}
          value={semester}
          onChange={(e) => setSemester(Number(e.target.value))}
          className={field}
        />
      </label>
      <fieldset className="space-y-2 text-sm sm:col-span-2">
        <legend className="text-muted-foreground">Dozent/in</legend>
        <div className="flex flex-wrap items-center gap-2">
          <span>{lecturerName || (lecturer?.id ? 'Name fehlt' : 'noch offen')}</span>
          {(lecturer ? lecturer.id : course?.lecturerName) && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setLecturer({ id: null, name: '' })}>
              Zuordnung entfernen
            </Button>
          )}
        </div>
        {lecturer?.id && (
          <label className="block space-y-1">
            <span className="text-muted-foreground">Anzeigename im Plan</span>
            <input
              required
              maxLength={120}
              value={lecturer.name}
              onChange={(e) => setLecturer({ ...lecturer, name: e.target.value })}
              className={field}
            />
          </label>
        )}
        <LecturerPicker onPick={(u) => setLecturer({ id: u.id, name: '' })} />
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-destructive sm:col-span-2">
          {error}
        </p>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={busy || !name.trim()}>
          Speichern
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </form>
  )
}

export default function AdminCourses() {
  const [programs, setPrograms] = useState<Load<Program[]>>({ state: 'loading' })
  const [selection, setSelection] = useState<{ programId?: string; semester: number }>({ semester: 1 })
  const [loaded, setLoaded] = useState<{ key: string; result: Load<PublicCourse[]> } | null>(null)
  // Saved changes win over the files until they catch up (about 2 min); null = deleted.
  const [changed, setChanged] = useState<Record<string, PublicCourse | null>>({})
  const [editing, setEditing] = useState<PublicCourse | 'new' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [open, setOpen] = useState<PublicCourse | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    getPrograms()
      .then((data) => setPrograms({ state: 'ok', data }))
      .catch(() => setPrograms({ state: 'error' }))
  }, [reload])

  const program =
    programs.state === 'ok' ? (programs.data.find((p) => p.id === selection.programId) ?? programs.data[0]) : undefined
  const semester = program ? Math.min(selection.semester, program.semesters) : 1
  const key = program ? `${program.id}/${semester}#${reload}` : ''
  const courses: Load<PublicCourse[]> = loaded?.key === key ? loaded.result : { state: 'loading' }

  useEffect(() => {
    if (!program) return
    getCourses(program.id, semester)
      .then((data) => setLoaded({ key, result: { state: 'ok', data } }))
      .catch(() => setLoaded({ key, result: { state: 'error' } }))
  }, [program, semester, key])

  const saved = (c: PublicCourse) => {
    setChanged((m) => ({ ...m, [c.id]: c }))
    setEditing(null)
    if (open?.id === c.id) setOpen(c)
  }
  const remove = async (c: PublicCourse) => {
    setMessage(null)
    try {
      await deleteCourse(c.id)
      setChanged((m) => ({ ...m, [c.id]: null }))
      if (open?.id === c.id) setOpen(null)
    } catch (err) {
      setMessage((err as Error).message)
    }
    setConfirmDelete(null)
  }

  if (programs.state === 'loading') return <p className="text-sm text-muted-foreground">Lädt …</p>
  if (programs.state === 'error' || !program) {
    return (
      <div role="alert" className="space-y-2 rounded-md border p-4 text-sm">
        <p>Studiengänge konnten nicht geladen werden.</p>
        <Button size="sm" variant="outline" onClick={() => setReload((n) => n + 1)}>
          Erneut versuchen
        </Button>
      </div>
    )
  }

  const shown = [
    ...(courses.state === 'ok' ? courses.data.filter((c) => !(c.id in changed)) : []),
    ...Object.values(changed).filter(
      (c): c is PublicCourse => !!c && c.programId === program.id && c.semester === semester,
    ),
  ].sort((a, b) => a.name.localeCompare(b.name, 'de'))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Studiengang</span>
          <select
            value={program.id}
            onChange={(e) => setSelection({ programId: e.target.value, semester })}
            className={field}
          >
            {programs.data.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Semester</span>
          <select
            value={semester}
            onChange={(e) => setSelection({ programId: program.id, semester: Number(e.target.value) })}
            className={field}
          >
            {Array.from({ length: program.semesters }, (_, i) => i + 1).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={() => setEditing('new')}>Neuer Kurs</Button>
      </div>

      {editing && (
        <CourseForm
          key={editing === 'new' ? 'new' : editing.id}
          course={editing === 'new' ? undefined : editing}
          programs={programs.data}
          defaults={{ programId: program.id, semester }}
          onSaved={saved}
          onCancel={() => setEditing(null)}
        />
      )}
      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}

      {courses.state === 'error' ? (
        <div role="alert" className="space-y-2 rounded-md border p-4 text-sm">
          <p>Kurse konnten nicht geladen werden.</p>
          <Button size="sm" variant="outline" onClick={() => setReload((n) => n + 1)}>
            Erneut versuchen
          </Button>
        </div>
      ) : courses.state === 'loading' ? (
        <p className="text-sm text-muted-foreground">Lädt …</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">Für dieses Semester sind keine Kurse eingetragen.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Kurse {program.name}, {semester}. Semester
            </caption>
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pr-3 font-normal">Kurs</th>
                <th className="py-2 pr-3 font-normal">Kürzel</th>
                <th className="py-2 pr-3 font-normal">Dozent/in</th>
                <th className="py-2 font-normal">
                  <span className="sr-only">Aktionen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} className="border-b align-middle">
                  <td className="py-2 pr-3 font-medium">{c.name}</td>
                  <td className="py-2 pr-3">{c.shortName}</td>
                  <td className="py-2 pr-3">{c.lecturerName ?? '–'}</td>
                  <td className="py-2">
                    <div className="flex justify-end gap-1">
                      {confirmDelete === c.id ? (
                        <>
                          <Button size="sm" variant="destructive" onClick={() => void remove(c)}>
                            Mit allen Terminen löschen
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                            Abbrechen
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant={open?.id === c.id ? 'secondary' : 'outline'}
                            aria-pressed={open?.id === c.id}
                            aria-label={`Termine von ${c.name}`}
                            onClick={() => setOpen(open?.id === c.id ? null : c)}
                          >
                            Termine
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`${c.name} bearbeiten`}
                            onClick={() => setEditing(c)}
                          >
                            Bearbeiten
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`${c.name} löschen`}
                            onClick={() => setConfirmDelete(c.id)}
                          >
                            Löschen
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && <AdminSessions key={open.id} course={open} />}
    </div>
  )
}
