import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  berlinMidnight,
  isSessionId,
  keys,
  newSessionId,
  sessionRange,
  sessionStart,
  addWeeksBerlin,
  berlinDate,
} from './keys.ts'

test('sessionId round-trips the start and matches the API pattern', () => {
  const start = new Date('2026-11-02T07:00:00Z')
  const id = newSessionId(start)
  assert.match(id, /^20261102T0700Z-[a-z0-9]{6}$/)
  assert.ok(isSessionId(id))
  assert.deepEqual(sessionStart(id), start)
})

test('sessionIds sort by start', () => {
  const starts = ['2026-12-01T08:00:00Z', '2026-11-02T07:00:00Z', '2026-11-02T07:15:00Z', '2027-01-10T06:30:00Z']
  const ids = starts.map((s) => newSessionId(new Date(s)))
  const byId = [...ids].sort().map(sessionStart)
  const byStart = starts.map((s) => new Date(s)).sort((a, b) => a.getTime() - b.getTime())
  assert.deepEqual(byId, byStart)
})

test('sessionStart rejects malformed ids', () => {
  assert.throws(() => sessionStart('20261102T0700Z'))
  assert.throws(() => sessionStart('20261102T0700Z-ABCDEF'))
  assert.ok(!isSessionId('x'))
})

test('key builders', () => {
  assert.deepEqual(keys.course('seb-7-cc'), { PK: 'COURSE#seb-7-cc', SK: 'META' })
  assert.deepEqual(keys.session('seb-7-cc', '20261102T0700Z-k3x9qa'), {
    PK: 'COURSE#seb-7-cc',
    SK: 'SESSION#20261102T0700Z-k3x9qa',
  })
  assert.deepEqual(keys.subscription('u1', 'seb-7-cc'), { PK: 'USER#u1', SK: 'SUB#seb-7-cc' })
  assert.deepEqual(keys.program('seb'), { PK: 'PROGRAMS', SK: 'PROGRAM#seb' })
  assert.deepEqual(keys.icalOfUser('u1'), { PK: 'USER#u1', SK: 'ICAL' })
  assert.deepEqual(keys.icalLookup('h'), { PK: 'ICAL#h', SK: 'META' })
  assert.equal(keys.programSemester('seb', 7), 'PROGRAM#seb#SEM#7')
  assert.equal(keys.lecturer('sub-1'), 'LECTURER#sub-1')
})

test('berlinMidnight handles winter and summer time and rejects invalid dates', () => {
  assert.equal(berlinMidnight('2026-11-02').toISOString(), '2026-11-01T23:00:00.000Z')
  assert.equal(berlinMidnight('2026-07-01').toISOString(), '2026-06-30T22:00:00.000Z')
  assert.throws(() => berlinMidnight('2026-02-30'))
  assert.throws(() => berlinMidnight('nope'))
})

// Mirrors DynamoDB `SK BETWEEN :lower AND :upper` (inclusive, byte order).
const inRange = (from: string, to: string, startIso: string): boolean => {
  const { lower, upper } = sessionRange(from, to)
  const sk = keys.session('c', newSessionId(new Date(startIso))).SK
  return lower <= sk && sk <= upper
}

test('range covers local days from..to inclusive', () => {
  // 2026-11-02..2026-11-08 local = 2026-11-01T23:00Z .. 2026-11-08T23:00Z (exclusive)
  assert.ok(inRange('2026-11-02', '2026-11-08', '2026-11-01T23:00:00Z'), 'first minute of from')
  assert.ok(inRange('2026-11-02', '2026-11-08', '2026-11-08T22:59:00Z'), 'last minute of to')
  assert.ok(!inRange('2026-11-02', '2026-11-08', '2026-11-01T22:59:00Z'), 'day before')
  assert.ok(!inRange('2026-11-02', '2026-11-08', '2026-11-08T23:00:00Z'), 'day after')
  assert.ok(inRange('2026-11-02', '2026-11-02', '2026-11-02T07:00:00Z'), 'single day')
})

test('range ends at local midnight on a 25-hour DST day', () => {
  // 2026-10-25: clocks go back, the next local midnight is 2026-10-25T23:00Z
  assert.ok(inRange('2026-10-25', '2026-10-25', '2026-10-25T22:30:00Z'))
  assert.ok(!inRange('2026-10-25', '2026-10-25', '2026-10-25T23:00:00Z'))
})

test('weekly repetition keeps the German wall-clock time across DST', () => {
  // Monday 08:00 CEST on 2026-10-19 is 06:00Z; two weeks later (after 25.10.) 08:00 CET is 07:00Z.
  assert.equal(addWeeksBerlin(new Date('2026-10-19T06:00:00Z'), 2).toISOString(), '2026-11-02T07:00:00.000Z')
  // Spring: 2027-03-22 08:00 CET = 07:00Z, a week later (after 28.03.) 08:00 CEST = 06:00Z.
  assert.equal(addWeeksBerlin(new Date('2027-03-22T07:00:00Z'), 1).toISOString(), '2027-03-29T06:00:00.000Z')
  assert.equal(addWeeksBerlin(new Date('2026-11-02T07:00:00Z'), 0).toISOString(), '2026-11-02T07:00:00.000Z')
})

test('local German day of an instant', () => {
  assert.equal(berlinDate(new Date('2026-11-02T23:30:00Z')), '2026-11-03')
  assert.equal(berlinDate(new Date('2026-07-01T21:59:00Z')), '2026-07-01')
  assert.equal(berlinDate(new Date('2026-07-01T22:00:00Z')), '2026-07-02')
})
