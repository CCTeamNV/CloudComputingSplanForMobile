// Lecturer: own courses (GET /lecturer/courses) and changes to own sessions (PATCH), see ADR 0006.
import { catalogFile, type Course } from './catalog'
import { apiFetch } from './client'
import { mergeSessions, type PublicSession } from './schedule'
import type { components } from './schema'

export type Session = components['schemas']['Session']
export type SessionPatch = components['schemas']['LecturerSessionPatch']

export async function getLecturerCourses(): Promise<Course[]> {
  const res = await apiFetch('/lecturer/courses')
  if (!res.ok) throw new Error(`lecturer courses: HTTP ${res.status}`)
  return ((await res.json()) as { items: Course[] }).items
}

/** Sessions of the own courses from now until `days` ahead, from the static files. */
export async function upcomingSessions(courses: Course[], now: Date, days = 14): Promise<PublicSession[]> {
  const files = await Promise.all(courses.map((c) => catalogFile<PublicSession[]>(`sessions/${c.id}.json`)))
  return upcoming(mergeSessions(files), now, days)
}

export const upcoming = (sessions: PublicSession[], now: Date, days: number): PublicSession[] => {
  const from = now.toISOString()
  const to = new Date(now.getTime() + days * 86_400_000).toISOString()
  return sessions.filter((s) => s.end > from && s.start < to)
}

/** The response is the stored session: show it at once instead of waiting for the file (up to ~2 min). */
export async function updateSession(s: PublicSession, patch: SessionPatch): Promise<Session> {
  const res = await apiFetch(
    `/lecturer/courses/${encodeURIComponent(s.courseId)}/sessions/${encodeURIComponent(s.id)}`,
    { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) },
  )
  if (res.ok) return (await res.json()) as Session
  if (res.status === 403) throw new Error('Das ist nicht dein Kurs.')
  if (res.status === 400) throw new Error('Bitte prüfe die Eingabe (Raum 1–40 Zeichen, Hinweis bis 200 Zeichen).')
  throw new Error('Speichern hat nicht geklappt. Bitte versuche es noch einmal.')
}
