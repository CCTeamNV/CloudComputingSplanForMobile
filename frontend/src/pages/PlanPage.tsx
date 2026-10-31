import { mockSchedule } from '@/api/mock'
import { cn } from '@/lib/utils'

const time = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })
const day = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Berlin' })

export default function PlanPage() {
  return (
    <section aria-labelledby="plan-heading">
      <h2 id="plan-heading" className="mb-3 text-base font-medium">
        {day.format(new Date())}
      </h2>
      <ul className="space-y-3">
        {mockSchedule.map((s) => (
          <li key={s.id} className={cn('rounded-lg border p-3', s.cancelled && 'opacity-70')}>
            <p className="text-sm text-muted-foreground">
              {time.format(new Date(s.start))} – {time.format(new Date(s.end))}
            </p>
            <p className={cn('font-medium', s.cancelled && 'line-through')}>{s.courseName}</p>
            <p className="text-sm">
              Raum {s.room}
              {s.originalRoom && <span className="text-muted-foreground"> (statt {s.originalRoom})</span>}
            </p>
            {s.cancelled && <p className="mt-1 text-sm font-medium text-destructive">Fällt aus{s.note && `: ${s.note}`}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}
