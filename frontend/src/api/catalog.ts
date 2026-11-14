// Static catalog files on CloudFront with the signature from GET /me/subscriptions (ADR 0013), and subscriptions.
import { apiFetch } from './client'
import type { components } from './schema'

type Schemas = components['schemas']
export type Program = Schemas['Program']
export type PublicCourse = Schemas['PublicCourse']
export type Course = Schemas['Course']
type CatalogAccess = Schemas['CatalogAccess']

let access: CatalogAccess | null = null

/** Subscribed courses; also refreshes the catalog signature, which comes with the same response. */
export async function getSubscriptions(): Promise<Course[]> {
  const res = await apiFetch('/me/subscriptions')
  if (!res.ok) throw new Error(`subscriptions: HTTP ${res.status}`)
  const body = (await res.json()) as { items: Course[]; catalogAccess: CatalogAccess }
  access = body.catalogAccess
  return body.items
}

const signature = async (force: boolean): Promise<string> => {
  if (force || !access || new Date(access.expiresAt).getTime() - 60_000 < Date.now()) await getSubscriptions()
  return access!.query
}

/**
 * A catalog file. CloudFront answers a missing file or an invalid/expired signature with index.html and 200,
 * so a non-JSON answer means: get a fresh signature and try once more, then give up.
 */
export async function catalogFile<T>(path: string): Promise<T> {
  for (const force of [false, true]) {
    const res = await fetch(`/catalog/${path}?${await signature(force)}`)
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      return ((await res.json()) as { items: T }).items
    }
  }
  throw new Error(`catalog/${path}: no data`)
}

export const getPrograms = () => catalogFile<Program[]>('programs.json')
export const getCourses = (programId: string, semester: number) =>
  catalogFile<PublicCourse[]>(`courses/${encodeURIComponent(programId)}/${semester}.json`)

/** PUT or DELETE a subscription; resolves only on 204, otherwise throws a message for the user. */
export async function setSubscribed(courseId: string, subscribed: boolean): Promise<void> {
  const res = await apiFetch(`/me/subscriptions/${encodeURIComponent(courseId)}`, {
    method: subscribed ? 'PUT' : 'DELETE',
  })
  if (res.status === 204) return
  if (res.status === 409) throw new Error('Du kannst höchstens 50 Kurse abonnieren.')
  throw new Error('Das hat nicht geklappt. Bitte versuche es noch einmal.')
}

/**
 * Optimistic toggle: `onChange` gets the new set at once and the old one back if the request fails.
 * Returns the error message, or null.
 */
export async function toggleOptimistic(
  current: ReadonlySet<string>,
  courseId: string,
  onChange: (next: Set<string>) => void,
  request = setSubscribed,
): Promise<string | null> {
  const subscribe = !current.has(courseId)
  const next = new Set(current)
  if (subscribe) next.add(courseId)
  else next.delete(courseId)
  onChange(next)
  try {
    await request(courseId, subscribe)
    return null
  } catch (err) {
    onChange(new Set(current))
    return err instanceof TypeError // fetch rejects with TypeError when offline
      ? 'Keine Verbindung. Bitte versuche es noch einmal.'
      : (err as Error).message
  }
}
