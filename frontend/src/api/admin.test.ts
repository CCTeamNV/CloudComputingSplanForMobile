import { beforeEach, expect, test, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('./client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
const { berlinInstant, createSessions, deleteCourse, updateCourse } = await import('./admin')

beforeEach(() => apiFetch.mockReset())

test('berlinInstant uses the offset of that day', () => {
  expect(berlinInstant('2026-10-19', '08:00')).toBe('2026-10-19T06:00:00.000Z') // CEST
  expect(berlinInstant('2026-10-26', '08:00')).toBe('2026-10-26T07:00:00.000Z') // CET
  expect(() => berlinInstant('2027-03-28', '02:30')).toThrow() // skipped hour
})

test('requests go to the contract paths with a JSON body', async () => {
  apiFetch.mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 'x' }] }), { status: 201 }))
  expect(await createSessions('cc', { start: 'a', end: 'b', room: 'F.201', kind: 'lecture', repeatWeeks: 14 })).toEqual(
    [{ id: 'x' }],
  )
  const [path, init] = apiFetch.mock.calls[0] as [string, RequestInit]
  expect(path).toBe('/admin/courses/cc/sessions')
  expect(init.method).toBe('POST')
  expect(JSON.parse(String(init.body)).repeatWeeks).toBe(14)

  apiFetch.mockResolvedValueOnce(new Response(null, { status: 204 }))
  await deleteCourse('cc')
  expect(apiFetch.mock.calls[1]).toEqual([
    '/admin/courses/cc',
    { method: 'DELETE', headers: undefined, body: undefined },
  ])
})

test('errors become readable messages with the backend reason', async () => {
  apiFetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ code: 'bad_request', message: 'program has only 7 semesters' }), { status: 400 }),
  )
  await expect(updateCourse('cc', { name: 'x', programId: 'seb', semester: 9 })).rejects.toThrow(
    'Bitte prüfe die Eingabe (program has only 7 semesters).',
  )
  apiFetch.mockResolvedValueOnce(new Response('{}', { status: 403 }))
  await expect(deleteCourse('cc')).rejects.toThrow('Nur für Admins.')
})
