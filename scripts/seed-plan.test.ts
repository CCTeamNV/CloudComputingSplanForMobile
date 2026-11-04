import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isSessionId } from '../backend/shared/keys.ts'
import { courses, seedSessionId, semesterOf, sessionsFor, testUserEmail } from './seed-plan.ts'

test('semester follows the date', () => {
  assert.deepEqual(semesterOf(new Date('2026-11-04T00:00:00Z')).start, '2026-10-01')
  assert.deepEqual(semesterOf(new Date('2027-01-15T00:00:00Z')).start, '2026-10-01')
  assert.deepEqual(semesterOf(new Date('2027-05-01T00:00:00Z')).start, '2027-03-16')
})

test('session ids are deterministic and valid', () => {
  const start = new Date('2026-11-02T07:00:00Z')
  const id = seedSessionId('seb-7-cloud-computing', start)
  assert.equal(id, seedSessionId('seb-7-cloud-computing', start))
  assert.notEqual(id, seedSessionId('seb-7-it-sicherheit', start))
  assert.ok(isSessionId(id), id)
})

test('sessions are weekly, in local time, unique and skip the Christmas break', () => {
  const sessions = sessionsFor(new Date('2026-11-04T00:00:00Z'))
  const cc = sessions.filter((s) => s.courseId === 'seb-7-cloud-computing')
  // Monday 2026-11-02 08:00 CET = 07:00Z, Wednesday 2026-10-07 14:00 CEST = 12:00Z
  assert.ok(cc.some((s) => s.start === '2026-11-02T07:00:00.000Z' && s.end === '2026-11-02T08:30:00.000Z'))
  assert.ok(cc.some((s) => s.start === '2026-10-07T12:00:00.000Z' && s.kind === 'lab'))
  assert.ok(!sessions.some((s) => s.start >= '2026-12-23' && s.start < '2027-01-07'))
  assert.equal(new Set(sessions.map((s) => `${s.courseId}/${s.id}`)).size, sessions.length)
  assert.ok(sessions.every((s) => s.start < s.end))
  assert.deepEqual(sessionsFor(new Date('2026-11-04T00:00:00Z')), sessions)
})

test('seed data fits the API contract', () => {
  assert.ok(courses.every((c) => /^[a-z0-9-]{1,64}$/.test(c.id)))
  assert.ok(courses.filter((c) => c.programId === 'seb' && c.semester === 7).length >= 2)
  assert.equal(testUserEmail(7), 'k6-007@loadtest.example.com')
})
