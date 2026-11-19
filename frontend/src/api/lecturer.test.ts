import { beforeEach, expect, test, vi } from 'vitest'
import type { PublicSession } from './schedule'

const apiFetch = vi.fn()
vi.mock('./client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
vi.mock('./catalog', () => ({ catalogFile: vi.fn() }))
const { updateSession, upcoming } = await import('./lecturer')

const s = (id: string, start: string, end: string): PublicSession => ({
  id,
  courseId: 'cc',
  courseName: 'Cloud Computing',
  start,
  end,
  room: 'F.201',
  kind: 'lecture',
  cancelled: false,
  originalRoom: null,
  updatedAt: start,
})

beforeEach(() => apiFetch.mockReset())

test('upcoming keeps running and future sessions within the window', () => {
  const now = new Date('2026-11-16T07:30:00Z')
  const list = [
    s('past', '2026-11-15T07:00:00Z', '2026-11-15T08:30:00Z'),
    s('running', '2026-11-16T07:00:00Z', '2026-11-16T08:30:00Z'),
    s('soon', '2026-11-20T07:00:00Z', '2026-11-20T08:30:00Z'),
    s('later', '2026-12-07T07:00:00Z', '2026-12-07T08:30:00Z'),
  ]
  expect(upcoming(list, now, 14).map((x) => x.id)).toEqual(['running', 'soon'])
})

test('PATCH goes to the session and returns the stored version', async () => {
  const stored = {
    ...s('20261116T0700Z-aaaaaa', '2026-11-16T07:00:00Z', '2026-11-16T08:30:00Z'),
    cancelled: true,
    note: 'krank',
  }
  apiFetch.mockResolvedValueOnce(new Response(JSON.stringify(stored), { status: 200 }))
  expect(await updateSession(stored, { cancelled: true, note: 'krank' })).toEqual(stored)
  const [path, init] = apiFetch.mock.calls[0] as [string, RequestInit]
  expect(path).toBe('/lecturer/courses/cc/sessions/20261116T0700Z-aaaaaa')
  expect(init.method).toBe('PATCH')
  expect(JSON.parse(String(init.body))).toEqual({ cancelled: true, note: 'krank' })
})

test('errors become readable messages', async () => {
  const x = s('id', '2026-11-16T07:00:00Z', '2026-11-16T08:30:00Z')
  apiFetch.mockResolvedValueOnce(new Response('{}', { status: 403 }))
  await expect(updateSession(x, { cancelled: true })).rejects.toThrow(/nicht dein Kurs/)
  apiFetch.mockResolvedValueOnce(new Response('{}', { status: 400 }))
  await expect(updateSession(x, { room: '' })).rejects.toThrow(/Eingabe/)
})
