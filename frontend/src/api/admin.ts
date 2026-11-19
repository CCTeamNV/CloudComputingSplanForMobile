// Admin: courses, sessions and roles (tag admin in docs/api.yaml). Reading comes from the static files (ADR 0013).
import type { Course } from './catalog'
import { apiFetch } from './client'
import type { Session } from './lecturer'
import { berlinDay, berlinTime } from './schedule'
import type { components } from './schema'

type Schemas = components['schemas']
export type CourseInput = Schemas['CourseInput']
export type SessionInput = Schemas['SessionInput']
export type User = Schemas['User']
export type Role = Schemas['Role']

/** JSON request; resolves with the body (or nothing on 204), otherwise throws a message for the admin. */
async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 204) return undefined as T
  if (res.ok) return (await res.json()) as T
  const message = ((await res.json().catch(() => ({}))) as { message?: string }).message
  if (res.status === 400) throw new Error(`Bitte prüfe die Eingabe${message ? ` (${message})` : ''}.`)
  if (res.status === 403) throw new Error('Nur für Admins.')
  if (res.status === 404) throw new Error('Nicht gefunden, vielleicht inzwischen gelöscht.')
  if (res.status === 409) throw new Error(message ?? 'Konflikt, bitte neu laden.')
  throw new Error('Das hat nicht geklappt. Bitte versuche es noch einmal.')
}

const course = (id: string) => `/admin/courses/${encodeURIComponent(id)}`
const session = (courseId: string, id: string) => `${course(courseId)}/sessions/${encodeURIComponent(id)}`

export const createCourse = (c: CourseInput) => send<Course>('POST', '/admin/courses', c)
/** Without `lecturerId` the backend keeps the lecturer; `null` removes it. */
export const updateCourse = (id: string, c: CourseInput) => send<Course>('PUT', course(id), c)
export const deleteCourse = (id: string) => send<void>('DELETE', course(id))

export const createSessions = async (courseId: string, s: SessionInput & { repeatWeeks: number }) =>
  (await send<{ items: Session[] }>('POST', `${course(courseId)}/sessions`, s)).items
/** Moving the start gives a new id (ADR 0003); the response has it. */
export const updateSessionAdmin = (courseId: string, id: string, s: SessionInput) =>
  send<Session>('PUT', session(courseId, id), s)
export const deleteSessionAdmin = (courseId: string, id: string) => send<void>('DELETE', session(courseId, id))

export const findUsers = async (email: string) =>
  (await send<{ items: User[] }>('GET', `/admin/users?email=${encodeURIComponent(email)}`)).items
export const setRoles = (userId: string, roles: Role[]) =>
  send<User>('PUT', `/admin/users/${encodeURIComponent(userId)}/roles`, { roles })

/** `2026-10-19` + `08:00` German local time as an instant; the offset is +01:00 or +02:00 depending on DST. */
export const berlinInstant = (day: string, time: string): string => {
  const iso = ['+01:00', '+02:00']
    .map((offset) => `${day}T${time}:00${offset}`)
    .find((c) => berlinDay(c) === day && berlinTime(c) === time)
  if (!iso) throw new Error(`${day} ${time} gibt es in deutscher Zeit nicht`) // the hour skipped in spring
  return new Date(iso).toISOString()
}
