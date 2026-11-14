import { beforeEach, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { Session } from '../../shared/api.ts'
import { db } from '../../shared/db.ts'
import { icalTokenHash, utcStamp } from '../../shared/keys.ts'
import { escapeText, fold, handler, icalTime, toIcs } from './index.ts'

process.env.TABLE_NAME = 'table'

const session = (over: Partial<Session> = {}): Session => ({
  id: '20261102T0700Z-aaaaaa',
  courseId: 'cc',
  courseName: 'Cloud Computing',
  start: '2026-11-02T07:00:00.000Z',
  end: '2026-11-02T08:30:00.000Z',
  room: 'F.201',
  kind: 'lecture',
  cancelled: false,
  originalRoom: null,
  note: 'secret note',
  updatedAt: '2026-11-01T10:00:00.000Z',
  ...over,
})

test('times are UTC in basic format, also for offsets and summer time', () => {
  assert.equal(icalTime('2026-11-02T08:00:00+01:00'), '20261102T070000Z')
  assert.equal(icalTime('2026-10-19T08:00:00+02:00'), '20261019T060000Z')
})

test('text escaping per RFC 5545', () => {
  assert.equal(escapeText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne')
})

test('lines fold at 75 octets without splitting UTF-8 characters', () => {
  const line = `SUMMARY:${'ü'.repeat(60)}`
  const folded = fold(line)
  for (const part of folded.split('\r\n')) assert.ok(Buffer.byteLength(part) <= 75, part)
  assert.equal(folded.replace(/\r\n /g, ''), line)
  assert.equal(fold('SHORT'), 'SHORT')
})

test('feed marks cancellations and room changes and leaves out notes', () => {
  const ics = toIcs(
    [
      session({ cancelled: true }),
      session({
        id: '20261109T0700Z-bbbbbb',
        room: 'Z.1',
        originalRoom: 'F.201',
        courseName: 'Cloud, Computing; Lab',
        kind: 'lab',
      }),
    ],
    new Date('2026-11-14T12:00:00Z'),
  )
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'))
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'))
  assert.ok(!/[^\r]\n/.test(ics), 'CRLF line endings only')
  const [first, second] = ics.split('BEGIN:VEVENT').slice(1)
  assert.match(first, /STATUS:CANCELLED/)
  assert.match(first, /SUMMARY:Abgesagt: Cloud Computing \(Vorlesung\)/)
  assert.match(first, /DTSTART:20261102T070000Z\r\nDTEND:20261102T083000Z/)
  assert.match(first, /UID:cc-20261102T0700Z-aaaaaa@splan/)
  assert.match(second, /STATUS:CONFIRMED/)
  assert.match(second, /LOCATION:Z\.1/)
  assert.match(second, /DESCRIPTION:Raumänderung: vorher F\.201/)
  assert.match(second, /SUMMARY:Cloud\\, Computing\\; Lab \(Labor\)/)
  assert.ok(!ics.includes('secret note'))
})

// --- handler with an in-memory table ---

const TOKEN = 'A'.repeat(43)
let table: Record<string, unknown>[]

beforeEach(() => {
  const tomorrow = new Date(Date.now() + 86_400_000)
  table = [
    { PK: `ICAL#${icalTokenHash(TOKEN)}`, SK: 'META', userId: 'u1' },
    { PK: 'USER#u1', SK: 'SUB#cc' },
    {
      PK: 'COURSE#cc',
      SK: `SESSION#${utcStamp(tomorrow)}-aaaaaa`,
      ...session({
        start: new Date(Date.now() + 86_400_000).toISOString(),
        end: new Date(Date.now() + 90_000_000).toISOString(),
      }),
    },
  ]
  mock.method(db, 'send', async (cmd: { constructor: { name: string }; input: Record<string, any> }) => {
    const { input } = cmd
    if (cmd.constructor.name === 'GetCommand') {
      return { Item: table.find((i) => i.PK === input.Key.PK && i.SK === input.Key.SK) }
    }
    const v = input.ExpressionAttributeValues
    return {
      Items: table.filter(
        (i) =>
          i.PK === v[':pk'] &&
          (v[':sub']
            ? (i.SK as string).startsWith(v[':sub'])
            : (i.SK as string) >= v[':lower'] && (i.SK as string) <= v[':upper']),
      ),
    }
  })
})

const get = async (token: string) =>
  (await handler({
    pathParameters: { token },
  } as unknown as APIGatewayProxyEventV2)) as APIGatewayProxyStructuredResultV2

test('valid token returns the calendar, unknown and malformed tokens the same 404', async () => {
  const ok = await get(TOKEN)
  assert.equal(ok.statusCode, 200)
  assert.equal(ok.headers?.['content-type'], 'text/calendar; charset=utf-8')
  assert.match(String(ok.body), /BEGIN:VEVENT/)

  const unknown = await get('B'.repeat(43))
  const malformed = await get('../../etc')
  assert.equal(unknown.statusCode, 404)
  assert.deepEqual(malformed, unknown)
})
