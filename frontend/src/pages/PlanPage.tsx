import { ChevronLeft, ChevronRight, CircleX, History, MapPinned } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import {
  addDays,
  berlinDay,
  berlinTime,
  currentOrNext,
  loadSchedule,
  recentlyChanged,
  sessionsOn,
  weekDays,
  type PublicSession,
} from '@/api/schedule'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const KIND: Record<PublicSession['kind'], string> = {
  lecture: 'Vorlesung',
  lab: 'Labor',
  exercise: 'Übung',
  exam: 'Prüfung',
}
const dayTitle = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const dayShort = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: 'numeric',
  month: 'numeric',
  timeZone: 'UTC',
})
// Days are `yyyy-MM-dd`; noon UTC formats as that same calendar day everywhere.
const asDate = (day: string) => new Date(`${day}T12:00:00Z`)

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ok'; sessions: PublicSession[] }

function SessionCard({
  s,
  highlight,
  compact,
  now,
}: {
  s: PublicSession
  highlight?: string
  compact?: boolean
  now: Date
}) {
  // Every marking has an icon and a word, never colour alone (WCAG 1.4.1); no opacity, to keep AA contrast.
  return (
    <li
      className={cn(
        'rounded-lg border p-3',
        highlight && 'border-primary ring-1 ring-primary',
        s.cancelled && 'border-destructive/60 bg-destructive/5',
        compact && 'p-2',
      )}
    >
      <p className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span className={cn(s.cancelled && 'line-through')}>
          {berlinTime(s.start)} – {berlinTime(s.end)}
        </span>
        {highlight && <span className="text-xs font-medium text-primary">{highlight}</span>}
      </p>
      <p className={cn('font-medium', s.cancelled && 'line-through')}>{s.courseName}</p>
      {s.cancelled ? (
        <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-destructive">
          <CircleX aria-hidden className="size-4 shrink-0" />
          Fällt aus
        </p>
      ) : s.originalRoom ? (
        <p className="mt-0.5 flex items-start gap-1.5 text-sm font-medium">
          <MapPinned aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            Raumänderung: {s.room}
            <span className="font-normal text-muted-foreground">
              , vorher <span className="line-through">{s.originalRoom}</span>
            </span>
          </span>
        </p>
      ) : (
        <p className="text-sm">
          Raum {s.room}
          {!compact && <span className="text-muted-foreground"> · {KIND[s.kind] ?? s.kind}</span>}
        </p>
      )}
      {recentlyChanged(s, now) && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <History aria-hidden className="size-3.5 shrink-0" />
          Kürzlich geändert
        </p>
      )}
    </li>
  )
}

export default function PlanPage() {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [reload, setReload] = useState(0)
  const [now] = useState(() => new Date())
  const today = berlinDay(now)
  const [day, setDay] = useState(today)
  const [view, setView] = useState<'day' | 'week'>('day')
  const touchX = useRef<number | null>(null)

  useEffect(() => {
    loadSchedule()
      .then((sessions) => setLoad({ state: 'ok', sessions }))
      .catch(() => setLoad({ state: 'error' }))
  }, [reload])

  const step = view === 'day' ? 1 : 7
  const move = (n: number) => setDay((d) => addDays(d, n * step))
  const days = view === 'day' ? [day] : weekDays(day)
  const sessions = load.state === 'ok' ? load.sessions : []
  const highlight = currentOrNext(sessions, now)

  return (
    <section
      aria-labelledby="plan-heading"
      className="space-y-4"
      // Swipe left/right to change the day (or week) on touch devices.
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - (touchX.current ?? e.changedTouches[0].clientX)
        if (Math.abs(dx) > 60) move(dx < 0 ? 1 : -1)
        touchX.current = null
      }}
    >
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          aria-label={view === 'day' ? 'Vorheriger Tag' : 'Vorherige Woche'}
          onClick={() => move(-1)}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <h2 id="plan-heading" className="flex-1 text-center text-base font-medium" aria-live="polite">
          {view === 'day'
            ? dayTitle.format(asDate(day))
            : `${dayShort.format(asDate(days[0]))} – ${dayShort.format(asDate(days[4]))}`}
        </h2>
        <Button
          size="icon"
          variant="ghost"
          aria-label={view === 'day' ? 'Nächster Tag' : 'Nächste Woche'}
          onClick={() => move(1)}
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="outline" disabled={days.includes(today)} onClick={() => setDay(today)}>
          Heute
        </Button>
        <div role="group" aria-label="Ansicht" className="flex rounded-lg border p-0.5">
          {(['day', 'week'] as const).map((v) => (
            <Button
              key={v}
              size="sm"
              variant={view === v ? 'secondary' : 'ghost'}
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              {v === 'day' ? 'Tag' : 'Woche'}
            </Button>
          ))}
        </div>
      </div>

      {load.state === 'error' ? (
        <div role="alert" className="space-y-2 rounded-md border p-4 text-sm">
          <p>Dein Plan konnte nicht geladen werden.</p>
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
      ) : load.state === 'loading' ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Lädt …
        </p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Du hast noch keine Kurse abonniert.{' '}
          <Link to="/courses" className="font-medium text-foreground underline underline-offset-4">
            Kurse suchen
          </Link>
        </p>
      ) : (
        <div className={cn(view === 'week' && 'space-y-4')}>
          {days.map((d) => {
            const list = sessionsOn(sessions, d)
            return (
              <div key={d}>
                {view === 'week' && (
                  <h3 className={cn('mb-2 text-sm font-medium', d === today && 'text-primary')}>
                    {dayTitle.format(asDate(d))}
                  </h3>
                )}
                {list.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {view === 'week'
                      ? 'Keine Termine'
                      : d === today
                        ? 'Heute hast du frei.'
                        : 'An diesem Tag hast du frei.'}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {list.map((s) => (
                      <SessionCard
                        key={`${s.courseId}/${s.id}`}
                        s={s}
                        compact={view === 'week'}
                        now={now}
                        highlight={
                          s === highlight ? (s.start <= now.toISOString() ? 'Jetzt' : 'Als Nächstes') : undefined
                        }
                      />
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
