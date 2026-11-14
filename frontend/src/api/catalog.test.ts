import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('./client', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))
const { catalogFile, getSubscriptions, setSubscribed, toggleOptimistic } = await import('./catalog')

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const html = () => new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } })
let issued = 0
const subscriptions = (expiresInMs = 3_600_000) => {
  issued++
  return json({
    items: [{ id: 'cc' }],
    catalogAccess: { query: `Policy=p${issued}`, expiresAt: new Date(Date.now() + expiresInMs).toISOString() },
  })
}

beforeEach(() => {
  issued = 0
  apiFetch.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

test('catalog files carry the signature from GET /me/subscriptions, which is reused while valid', async () => {
  apiFetch.mockImplementation(async () => subscriptions())
  const fetchMock = vi.fn(async () => json({ items: [{ id: 'seb' }] }))
  vi.stubGlobal('fetch', fetchMock)
  expect(await getSubscriptions()).toEqual([{ id: 'cc' }])
  expect(await catalogFile('programs.json')).toEqual([{ id: 'seb' }])
  expect(await catalogFile('courses/seb/7.json')).toEqual([{ id: 'seb' }])
  expect(fetchMock.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
    '/catalog/programs.json?Policy=p1',
    '/catalog/courses/seb/7.json?Policy=p1',
  ])
  expect(apiFetch).toHaveBeenCalledTimes(1)
})

test('an expiring signature is renewed before the request', async () => {
  apiFetch.mockImplementationOnce(async () => subscriptions(30_000)).mockImplementation(async () => subscriptions())
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ items: [] })),
  )
  await getSubscriptions()
  await catalogFile('programs.json')
  expect(apiFetch).toHaveBeenCalledTimes(2)
})

test('index.html instead of JSON: one retry with a fresh signature, then an error', async () => {
  apiFetch.mockImplementation(async () => subscriptions())
  await getSubscriptions()
  const recovering = vi
    .fn()
    .mockResolvedValueOnce(html())
    .mockResolvedValueOnce(json({ items: [1] }))
  vi.stubGlobal('fetch', recovering)
  expect(await catalogFile('programs.json')).toEqual([1])
  expect((recovering.mock.calls[1] as unknown[])[0]).toBe('/catalog/programs.json?Policy=p2')

  vi.stubGlobal(
    'fetch',
    vi.fn(async () => html()),
  )
  await expect(catalogFile('programs.json')).rejects.toThrow(/no data/)
})

test('subscribe maps the limit to a readable message', async () => {
  apiFetch.mockResolvedValueOnce(new Response(null, { status: 204 }))
  await expect(setSubscribed('cc', true)).resolves.toBeUndefined()
  expect(apiFetch).toHaveBeenLastCalledWith('/me/subscriptions/cc', { method: 'PUT' })
  apiFetch.mockResolvedValueOnce(json({ code: 'conflict' }, 409))
  await expect(setSubscribed('cc', true)).rejects.toThrow(/50 Kurse/)
})

test('optimistic toggle shows the change at once and rolls back on failure', async () => {
  const states: string[][] = []
  const onChange = (s: Set<string>) => states.push([...s])

  expect(await toggleOptimistic(new Set(['a']), 'b', onChange, async () => undefined)).toBeNull()
  expect(states).toEqual([['a', 'b']])

  states.length = 0
  const offline = async () => Promise.reject(new TypeError('Failed to fetch'))
  expect(await toggleOptimistic(new Set(['a']), 'a', onChange, offline)).toMatch(/Keine Verbindung/)
  expect(states).toEqual([[], ['a']])
})
