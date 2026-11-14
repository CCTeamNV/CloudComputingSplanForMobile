import { describe, expect, test, vi } from 'vitest'
import type { PublicSession } from './schedule'

const getSubscriptions = vi.fn()
const catalogFile = vi.fn()
vi.mock('./catalog', () => ({
  getSubscriptions: () => getSubscriptions(),
  catalogFile: (path: string) => catalogFile(path),
}))
const { addDays, berlinDay, berlinTime, currentOrNext, loadSchedule, mergeSessions, sessionsOn, weekDays } =
  await import('./schedule')

const s = (id: string, start: string, end: string, over: Partial<PublicSession> = {}): PublicSession => ({
  id,
  courseId: id.split('/')[0],
  courseName: id.split('/')[0],
  start,
  end,
  room: 'F.201',
  kind: 'lecture',
  cancelled: false,
  originalRoom: null,
  updatedAt: start,
  ...over,
})

describe('German local time across DST changes', () => {
  test('25.10.2026 (back to CET at 03:00): 08:00 local is 07:00Z', () => {
    expect(berlinDay('2026-10-25T07:00:00Z')).toBe('2026-10-25')
    expect(berlinTime('2026-10-25T07:00:00Z')).toBe('08:00')
    expect(berlinTime('2026-10-24T06:00:00Z')).toBe('08:00') // the day before, still CEST
  })
  test('29.03.2027 (CEST since 28.03.): 08:00 local is 06:00Z', () => {
    expect(berlinDay('2027-03-29T06:00:00Z')).toBe('2027-03-29')
    expect(berlinTime('2027-03-29T06:00:00Z')).toBe('08:00')
  })
  test('late evening UTC already belongs to the next German day', () => {
    expect(berlinDay('2026-11-02T23:30:00Z')).toBe('2026-11-03')
  })
})

test('day arithmetic and Monday-to-Friday weeks, also across month and DST borders', () => {
  expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
  expect(addDays('2026-10-26', -1)).toBe('2026-10-25')
  expect(weekDays('2026-10-25')).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'])
  expect(weekDays('2026-11-02')[0]).toBe('2026-11-02')
  expect(weekDays('2026-11-06')).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'])
})

test('sessions of several courses are merged, sorted and filtered by German day', () => {
  const merged = mergeSessions([
    [
      s('cc/2', '2026-11-03T07:00:00Z', '2026-11-03T08:30:00Z'),
      s('cc/1', '2026-11-02T07:00:00Z', '2026-11-02T08:30:00Z'),
    ],
    [
      s('its/1', '2026-11-02T08:45:00Z', '2026-11-02T10:15:00Z'),
      s('its/0', '2026-11-01T23:30:00Z', '2026-11-02T00:30:00Z'),
    ],
  ])
  expect(merged.map((x) => x.id)).toEqual(['its/0', 'cc/1', 'its/1', 'cc/2'])
  expect(sessionsOn(merged, '2026-11-02').map((x) => x.id)).toEqual(['its/0', 'cc/1', 'its/1'])
})

test('current or next session of today, skipping cancelled and finished ones', () => {
  const day = [
    s('a/1', '2026-11-02T07:00:00Z', '2026-11-02T08:30:00Z'),
    s('b/1', '2026-11-02T08:45:00Z', '2026-11-02T10:15:00Z', { cancelled: true }),
    s('c/1', '2026-11-02T12:00:00Z', '2026-11-02T13:30:00Z'),
  ]
  expect(currentOrNext(day, new Date('2026-11-02T07:30:00Z'))?.id).toBe('a/1') // running
  expect(currentOrNext(day, new Date('2026-11-02T08:40:00Z'))?.id).toBe('c/1') // b is cancelled
  expect(currentOrNext(day, new Date('2026-11-02T14:00:00Z'))).toBeUndefined()
})

test('loadSchedule fetches one file per subscribed course and merges them', async () => {
  getSubscriptions.mockResolvedValue([{ id: 'cc' }, { id: 'its' }])
  catalogFile.mockImplementation(async (path: string) =>
    path === 'sessions/cc.json'
      ? [s('cc/1', '2026-11-02T09:00:00Z', '2026-11-02T10:00:00Z')]
      : [s('its/1', '2026-11-02T07:00:00Z', '2026-11-02T08:00:00Z')],
  )
  expect((await loadSchedule()).map((x) => x.id)).toEqual(['its/1', 'cc/1'])
  expect(catalogFile.mock.calls.map((c) => c[0]).sort()).toEqual(['sessions/cc.json', 'sessions/its.json'])
})
