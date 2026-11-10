import { beforeEach, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { db } from '../../shared/db.ts'
import { handler, parsePatch } from './index.ts'

process.env.TABLE_NAME = 'table'

type Item = Record<string, unknown>
const SID = '20261102T0700Z-aaaaaa'
let table: Item[]

beforeEach(() => {
  table = [
    {
      PK: 'COURSE#cc',
      SK: 'META',
      name: 'Cloud Computing',
      programId: 'seb',
      semester: 7,
      lecturerId: 'lect-a',
      GSI2PK: 'LECTURER#lect-a',
    },
    {
      PK: 'COURSE#swa',
      SK: 'META',
      name: 'SWA',
      programId: 'seb',
      semester: 7,
      lecturerId: 'lect-b',
      GSI2PK: 'LECTURER#lect-b',
    },
    {
      PK: 'COURSE#cc',
      SK: `SESSION#${SID}`,
      courseName: 'Cloud Computing',
      start: '2026-11-02T07:00:00.000Z',
      end: '2026-11-02T08:30:00.000Z',
      room: 'F.201',
      kind: 'lecture',
      cancelled: false,
      updatedAt: '2026-11-01T00:00:00.000Z',
    },
    {
      PK: 'COURSE#swa',
      SK: `SESSION#${SID}`,
      courseName: 'SWA',
      start: '2026-11-02T07:00:00.000Z',
      end: '2026-11-02T08:30:00.000Z',
      room: 'A.105',
      kind: 'lecture',
      cancelled: false,
      updatedAt: '2026-11-01T00:00:00.000Z',
    },
  ]
  const same = (a: Item, b: Item) => a.PK === b.PK && a.SK === b.SK
  // Minimal DynamoDB: Get, Query on GSI2 and the SET/REMOVE update expressions the handler builds.
  mock.method(db, 'send', async (cmd: { constructor: { name: string }; input: Record<string, any> }) => {
    const { input } = cmd
    switch (cmd.constructor.name) {
      case 'GetCommand':
        return { Item: table.find((i) => same(i, input.Key)) }
      case 'UpdateCommand': {
        const item = table.find((i) => same(i, input.Key))
        if (!item) throw Object.assign(new Error('condition'), { name: 'ConditionalCheckFailedException' })
        const [, setPart = '', removePart = ''] = /^SET (.*?)(?: REMOVE (.*))?$/.exec(input.UpdateExpression)!
        for (const a of setPart.split(', ')) {
          const [name, value] = a.split(' = ')
          item[name] = input.ExpressionAttributeValues[value]
        }
        for (const name of removePart.split(', ').filter(Boolean)) delete item[name]
        return { Attributes: { ...item } }
      }
      default:
        return { Items: table.filter((i) => i.GSI2PK === input.ExpressionAttributeValues[':pk']) }
    }
  })
})

const call = async (
  routeKey: string,
  sub: string,
  groups: string,
  body?: unknown,
  courseId = 'cc',
  sessionId = SID,
) => {
  const r = (await handler({
    routeKey,
    pathParameters: { courseId, sessionId },
    body: body === undefined ? undefined : JSON.stringify(body),
    requestContext: { authorizer: { jwt: { claims: { sub, 'cognito:groups': groups }, scopes: [] } } },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer)) as APIGatewayProxyStructuredResultV2
  return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : undefined }
}
const PATCH = 'PATCH /lecturer/courses/{courseId}/sessions/{sessionId}'
const patch = (body: unknown, sub = 'lect-a', courseId = 'cc') => call(PATCH, sub, '[lecturer]', body, courseId)
const session = (course = 'cc') => table.find((i) => i.PK === `COURSE#${course}` && i.SK === `SESSION#${SID}`)!

test('lists only own courses', async () => {
  const { status, body } = await call('GET /lecturer/courses', 'lect-a', '[lecturer]')
  assert.equal(status, 200)
  assert.deepEqual(
    body.items.map((c: Item) => c.id),
    ['cc'],
  )
})

test('students and admins without the lecturer group get 403', async () => {
  assert.equal((await call('GET /lecturer/courses', 'lect-a', '')).status, 403)
  assert.equal((await call(PATCH, 'lect-a', '[admin]', { cancelled: true })).status, 403)
})

test("lecturer A cannot change lecturer B's session", async () => {
  const res = await patch({ cancelled: true }, 'lect-a', 'swa')
  assert.equal(res.status, 403)
  assert.equal(res.body.code, 'forbidden')
  assert.equal(session('swa').cancelled, false)
})

test('cancel and restore', async () => {
  const cancelled = await patch({ cancelled: true, note: 'Krankheitsbedingt' })
  assert.equal(cancelled.status, 200)
  assert.equal(cancelled.body.cancelled, true)
  assert.equal(cancelled.body.note, 'Krankheitsbedingt')
  assert.notEqual(cancelled.body.updatedAt, '2026-11-01T00:00:00.000Z')

  const restored = await patch({ cancelled: false, note: null })
  assert.equal(restored.body.cancelled, false)
  assert.equal(restored.body.note, null)
  assert.ok(!('note' in session()))
})

test('start and end cannot be changed', async () => {
  const res = await patch({ start: '2026-11-02T09:00:00.000Z' })
  assert.equal(res.status, 400)
  assert.equal(session().start, '2026-11-02T07:00:00.000Z')
  assert.equal((await patch({ cancelled: true, end: 'x' })).status, 400)
})

test('room change keeps the first original room and clears it when restored', async () => {
  assert.equal((await patch({ room: 'F.012' })).body.originalRoom, 'F.201')
  const second = await patch({ room: 'B.302' })
  assert.equal(second.body.room, 'B.302')
  assert.equal(second.body.originalRoom, 'F.201')
  const back = await patch({ room: 'F.201' })
  assert.equal(back.body.room, 'F.201')
  assert.equal(back.body.originalRoom, null)
})

test('unknown course or session is 404, invalid ids too', async () => {
  assert.equal((await patch({ cancelled: true }, 'lect-a', 'nope')).status, 404)
  assert.equal(
    (await call(PATCH, 'lect-a', '[lecturer]', { cancelled: true }, 'cc', '20991231T0000Z-zzzzzz')).status,
    404,
  )
  assert.equal((await call(PATCH, 'lect-a', '[lecturer]', { cancelled: true }, 'cc', 'bad')).status, 404)
})

test('body validation follows LecturerSessionPatch', () => {
  assert.equal(typeof parsePatch('{}'), 'string')
  assert.equal(typeof parsePatch('not json'), 'string')
  assert.equal(typeof parsePatch('[]'), 'string')
  assert.equal(typeof parsePatch('{"cancelled":"yes"}'), 'string')
  assert.equal(typeof parsePatch('{"room":""}'), 'string')
  assert.equal(typeof parsePatch(JSON.stringify({ room: 'x'.repeat(41) })), 'string')
  assert.equal(typeof parsePatch(JSON.stringify({ note: 'x'.repeat(201) })), 'string')
  assert.deepEqual(parsePatch('{"cancelled":true,"note":null}'), { cancelled: true, note: null })
})
