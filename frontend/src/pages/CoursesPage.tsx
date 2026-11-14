import { Check, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  getCourses,
  getPrograms,
  getSubscriptions,
  toggleOptimistic,
  type Course,
  type Program,
  type PublicCourse,
} from '@/api/catalog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const SELECTION = 'splan.courseFilter'

// Remembered per device, so the next visit needs no filtering (the point of #15).
const loadSelection = (): { programId?: string; semester?: number } => {
  try {
    return JSON.parse(localStorage.getItem(SELECTION) ?? '{}') as { programId?: string; semester?: number }
  } catch {
    return {}
  }
}
const saveSelection = (programId: string, semester: number) => {
  try {
    localStorage.setItem(SELECTION, JSON.stringify({ programId, semester }))
  } catch {
    // private mode: works, just not remembered
  }
}

type Load<T> = { state: 'loading' } | { state: 'error' } | { state: 'ok'; data: T }

export default function CoursesPage() {
  const [programs, setPrograms] = useState<Load<Program[]>>({ state: 'loading' })
  const [mine, setMine] = useState<Load<Course[]>>({ state: 'loading' })
  const [subscribed, setSubscribed] = useState<Set<string>>(new Set())
  const [selection, setSelection] = useState(loadSelection)
  // Result per program/semester; a selection without a result yet is loading (derived, not set in the effect).
  const [loaded, setLoaded] = useState<{ key: string; result: Load<PublicCourse[]> } | null>(null)
  const [view, setView] = useState<'all' | 'mine'>('all')
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  // Subscriptions first: they also bring the signature for the catalog files.
  useEffect(() => {
    getSubscriptions()
      .then((items) => {
        setMine({ state: 'ok', data: items })
        setSubscribed(new Set(items.map((c) => c.id)))
        return getPrograms()
      })
      .then((data) => setPrograms({ state: 'ok', data }))
      .catch(() => {
        setMine((m) => (m.state === 'ok' ? m : { state: 'error' }))
        setPrograms({ state: 'error' })
      })
  }, [reload])

  const program =
    programs.state === 'ok' ? (programs.data.find((p) => p.id === selection.programId) ?? programs.data[0]) : undefined
  const semester = program ? Math.min(selection.semester ?? 1, program.semesters) : undefined

  const key = program && semester ? `${program.id}/${semester}#${reload}` : ''
  const courses: Load<PublicCourse[]> = loaded?.key === key ? loaded.result : { state: 'loading' }

  useEffect(() => {
    if (!program || !semester) return
    getCourses(program.id, semester)
      .then((data) => setLoaded({ key, result: { state: 'ok', data } }))
      .catch(() => setLoaded({ key, result: { state: 'error' } }))
  }, [program, semester, key])

  const select = (programId: string, sem: number) => {
    setSelection({ programId, semester: sem })
    saveSelection(programId, sem)
  }

  const toggle = async (course: PublicCourse) => {
    setMessage(null)
    const error = await toggleOptimistic(subscribed, course.id, setSubscribed)
    if (error) return setMessage(error)
    // Keep "Meine Kurse" in step without another request.
    setMine((m) =>
      m.state !== 'ok'
        ? m
        : {
            state: 'ok',
            data: m.data.some((c) => c.id === course.id)
              ? m.data.filter((c) => c.id !== course.id)
              : [...m.data, { ...course, lecturerId: null }],
          },
    )
  }

  // Small lists (one semester or at most 50 subscriptions): no memoization needed.
  const list: PublicCourse[] =
    view === 'mine' ? (mine.state === 'ok' ? mine.data : []) : courses.state === 'ok' ? courses.data : []
  const q = query.trim().toLowerCase()
  const shown = list
    .filter((c) => !q || [c.name, c.shortName, c.lecturerName].some((v) => v?.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))

  const failed = programs.state === 'error' || (view === 'all' ? courses.state === 'error' : mine.state === 'error')
  const loading = !failed && (view === 'all' ? courses.state === 'loading' : mine.state === 'loading')

  return (
    <section aria-labelledby="courses-heading" className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="courses-heading" className="text-base font-medium">
          Kurse
        </h2>
        <div role="group" aria-label="Ansicht" className="flex rounded-lg border p-0.5">
          {(['all', 'mine'] as const).map((v) => (
            <Button
              key={v}
              size="sm"
              variant={view === v ? 'secondary' : 'ghost'}
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              {v === 'all' ? 'Alle' : `Meine Kurse${mine.state === 'ok' ? ` (${subscribed.size})` : ''}`}
            </Button>
          ))}
        </div>
      </div>

      {view === 'all' && programs.state === 'ok' && program && (
        <div className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">Studiengang</span>
            <select
              className="block w-full rounded-md border bg-background px-3 py-2"
              value={program.id}
              onChange={(e) => select(e.target.value, semester ?? 1)}
            >
              {programs.data.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div role="group" aria-label="Semester" className="flex flex-wrap gap-2">
            {Array.from({ length: program.semesters }, (_, i) => i + 1).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={s === semester ? 'default' : 'outline'}
                aria-pressed={s === semester}
                aria-label={`${s}. Semester`}
                className="min-w-9"
                onClick={() => select(program.id, s)}
              >
                {s}
              </Button>
            ))}
          </div>
        </div>
      )}

      <label className="block text-sm">
        <span className="sr-only">Suche</span>
        <input
          type="search"
          placeholder="Kurs, Kürzel oder Dozent suchen"
          className="block w-full rounded-md border bg-background px-3 py-2"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      {message && (
        <p role="alert" className="rounded-md border border-destructive/50 p-3 text-sm text-destructive">
          {message}
        </p>
      )}

      {failed ? (
        <div role="alert" className="space-y-2 rounded-md border p-4 text-sm">
          <p>Die Kurse konnten nicht geladen werden.</p>
          <Button size="sm" variant="outline" onClick={() => setReload((n) => n + 1)}>
            Erneut versuchen
          </Button>
        </div>
      ) : loading ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Lädt …
        </p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {query
            ? 'Keine Kurse passen zu deiner Suche.'
            : view === 'mine'
              ? 'Du hast noch keine Kurse abonniert. Wähle unter „Alle“ Studiengang und Semester.'
              : 'Für dieses Semester sind keine Kurse eingetragen.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((c) => {
            const isSubscribed = subscribed.has(c.id)
            return (
              <li key={c.id} className="flex items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {c.name}
                    {c.shortName && <span className="ml-2 text-sm text-muted-foreground">{c.shortName}</span>}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {c.lecturerName ?? 'Dozent/in noch offen'}
                    {view === 'mine' && ` · ${c.semester}. Semester`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={isSubscribed ? 'secondary' : 'outline'}
                  aria-pressed={isSubscribed}
                  aria-label={`${c.name} ${isSubscribed ? 'abbestellen' : 'abonnieren'}`}
                  className={cn('shrink-0', isSubscribed && 'text-primary')}
                  onClick={() => void toggle(c)}
                >
                  {isSubscribed ? <Check aria-hidden /> : <Plus aria-hidden />}
                  {isSubscribed ? 'Abonniert' : 'Abonnieren'}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
