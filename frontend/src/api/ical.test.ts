import { beforeEach, expect, test, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('./client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
const { revokeIcalUrl, rotateIcalUrl, storedIcalUrl, webcalUrl } = await import('./ical')
const { clearSession } = await import('@/auth')

beforeEach(() => {
  const m = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  })
  apiFetch.mockReset()
})

test('rotate stores the new URL, revoke and logout remove it', async () => {
  apiFetch.mockResolvedValueOnce(new Response(JSON.stringify({ url: 'https://api.test/ical/abc' }), { status: 201 }))
  expect(await rotateIcalUrl()).toBe('https://api.test/ical/abc')
  expect(apiFetch).toHaveBeenLastCalledWith('/me/ical-token', { method: 'POST' })
  expect(storedIcalUrl()).toBe('https://api.test/ical/abc')

  apiFetch.mockResolvedValueOnce(new Response(null, { status: 204 }))
  await revokeIcalUrl()
  expect(storedIcalUrl()).toBeNull()

  localStorage.setItem('splan.icalUrl', 'https://api.test/ical/xyz')
  clearSession()
  expect(storedIcalUrl()).toBeNull()
})

test('a failed rotation keeps the old URL', async () => {
  localStorage.setItem('splan.icalUrl', 'https://api.test/ical/old')
  apiFetch.mockResolvedValueOnce(new Response('{}', { status: 500 }))
  await expect(rotateIcalUrl()).rejects.toThrow()
  expect(storedIcalUrl()).toBe('https://api.test/ical/old')
})

test('webcal URL for direct subscription', () => {
  expect(webcalUrl('https://api.test/ical/abc')).toBe('webcal://api.test/ical/abc')
})
