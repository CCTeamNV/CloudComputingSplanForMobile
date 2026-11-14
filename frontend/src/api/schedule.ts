// Personal schedule built in the client from the static session files (ADR 0013), in German local time.
import { catalogFile, getSubscriptions } from './catalog'
import type { components } from './schema'

export type PublicSession = components['schemas']['PublicSession']

const TZ = 'Europe/Berlin'
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const timeFormat = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })

/** German calendar day (`yyyy-MM-dd`) of an instant, independent of the device's time zone. */
export const berlinDay = (instant: string | Date): string => dayFormat.format(new Date(instant))

/** `08:00` in German local time. */
export const berlinTime = (instant: string): string => timeFormat.format(new Date(instant))

/** Day arithmetic on `yyyy-MM-dd` strings (calendar days, no clock involved). */
export const addDays = (day: string, n: number): string => {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Monday to Friday of the week containing `day`. */
export const weekDays = (day: string): string[] => {
  const weekday = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7 // 0 = Monday
  const monday = addDays(day, -weekday)
  return [0, 1, 2, 3, 4].map((i) => addDays(monday, i))
}

/** All sessions of all files as one list, sorted by start. */
export const mergeSessions = (files: PublicSession[][]): PublicSession[] =>
  files.flat().sort((a, b) => a.start.localeCompare(b.start) || a.courseName.localeCompare(b.courseName, 'de'))

export const sessionsOn = (sessions: PublicSession[], day: string): PublicSession[] =>
  sessions.filter((s) => berlinDay(s.start) === day)

/** The session running now, or else the next one today; for highlighting. */
export const currentOrNext = (sessions: PublicSession[], now: Date): PublicSession | undefined => {
  const t = now.toISOString()
  return sessions.find((s) => !s.cancelled && s.end > t && berlinDay(s.start) === berlinDay(now))
}

/** Subscriptions first (they bring the signature), then one file per course in parallel. */
export async function loadSchedule(): Promise<PublicSession[]> {
  const courses = await getSubscriptions()
  return mergeSessions(await Promise.all(courses.map((c) => catalogFile<PublicSession[]>(`sessions/${c.id}.json`))))
}
