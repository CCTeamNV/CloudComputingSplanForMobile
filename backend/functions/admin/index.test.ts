import { beforeEach, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { db } from '../../shared/db.ts'
import { cognito, courseIdFor, handler } from './index.ts'

process.env.TABLE_NAME = 'table'

type Item = Record<string, any>
let table: Item[]
let groups: Record<string, string[]> // Cognito username (= sub) -> groups
const users = [
  { sub: 'admin-1', email: 'admin@loadtest.example.com' },
  { sub: 'lect-1', email: 'dozent.beispiel@loadtest.example.com' },
  { sub: 'stud-1', email: 'k6-001@loadtest.example.com' },
]

const same = (a: Item, b: Item) => a.PK === b.PK && a.SK === b.SK
const conditionFailed = () => Object.assign(new Error('condition'), { name: 'ConditionalCheckFailedException' })
const put = (input: Item) => {
  const exists = table.some((i) => same(i, input.Item))
  if (input.ConditionExpression === 'attribute_not_exists(PK)' && exists) throw conditionFailed()
  if (input.ConditionExpression === 'attribute_exists(PK)' && !exists) throw conditionFailed()
  const item = Object.fromEntries(Object.entries(input.Item).filter(([, v]) => v !== undefined))
  table = table.filter((i) => !same(i, item)).concat(item)
}
const del = (key: Item) => (table = table.filter((i) => !same(i, key)))

beforeEach(() => {
  table = [
    { PK: 'PROGRAMS', SK: 'PROGRAM#seb', name: 'SEB', semesters: 7 },
    {
      PK: 'COURSE#cc',
      SK: 'META',
      name: 'Cloud Computing',
      programId: 'seb',
      semester: 7,
      lecturerId: 'lect-1',
      GSI1PK: 'PROGRAM#seb#SEM#7',
      GSI2PK: 'LECTURER#lect-1',
    },
    {
      PK: 'COURSE#cc',
      SK: 'SESSION#20261102T0700Z-aaaaaa',
      courseName: 'Cloud Computing',
      start: '2026-11-02T07:00:00.000Z',
      end: '2026-11-02T08:30:00.000Z',
      room: 'F.201',
      kind: 'lecture',
      cancelled: true,
      note: 'krank',
      updatedAt: 'x',
    },
    {
      PK: 'COURSE#cc',
      SK: 'SESSION#20261109T0700Z-bbbbbb',
      courseName: 'Cloud Computing',
      start: '2026-11-09T07:00:00.000Z',
      end: '2026-11-09T08:30:00.000Z',
      room: 'F.201',
      kind: 'lecture',
      cancelled: false,
      updatedAt: 'x',
    },
    { PK: 'USER#stud-1', SK: 'SUB#cc' },
  ]
  groups = { 'admin-1': ['admin'], 'lect-1': ['lecturer'], 'stud-1': [] }

  mock.method(db, 'send', async (cmd: { constructor: { name: string }; input: Item }) => {
    const { input } = cmd
    switch (cmd.constructor.name) {
      case 'GetCommand':
        return { Item: table.find((i) => same(i, input.Key)) }
      case 'PutCommand':
        return (put(input), {})
      case 'DeleteCommand':
        return (del(input.Key), {})
      case 'UpdateCommand': {
        const item = table.find((i) => same(i, input.Key))
        if (!item) throw conditionFailed()
        item.courseName = input.ExpressionAttributeValues[':name']
        return {}
      }
      case 'BatchWriteCommand':
        for (const r of input.RequestItems.table) del(r.DeleteRequest.Key)
        return { UnprocessedItems: {} }
      case 'TransactWriteCommand': {
        const [p, d] = input.TransactItems
        if (!table.some((i) => same(i, d.Delete.Key))) {
          throw Object.assign(new Error('tx'), { name: 'TransactionCanceledException' })
        }
        put(p.Put)
        return (del(d.Delete.Key), {})
      }
      default: // QueryCommand on PK
        return { Items: table.filter((i) => i.PK === input.ExpressionAttributeValues[':pk']) }
    }
  })

  mock.method(cognito, 'send', async (cmd: { constructor: { name: string }; input: Item }) => {
    const { input } = cmd
    assert.equal(input.UserPoolId, 'eu-central-1_TEST')
    const attrs = (u: (typeof users)[number]) => [
      { Name: 'sub', Value: u.sub },
      { Name: 'email', Value: u.email },
    ]
    switch (cmd.constructor.name) {
      case 'ListUsersCommand': {
        const [, field, op, value] = /^(\w+) (\^?=) "(.*)"$/.exec(input.Filter)!
        const match = users.filter((u) => {
          const v = field === 'sub' ? u.sub : u.email
          return op === '=' ? v === value : v.startsWith(value)
        })
        return { Users: match.map((u) => ({ Username: u.sub, Attributes: attrs(u) })) }
      }
      case 'AdminListGroupsForUserCommand':
        if (!(input.Username in groups)) throw Object.assign(new Error('nf'), { name: 'UserNotFoundException' })
        return { Groups: groups[input.Username].map((GroupName) => ({ GroupName })) }
      case 'AdminAddUserToGroupCommand':
        return (groups[input.Username].push(input.GroupName), {})
      case 'AdminRemoveUserFromGroupCommand':
        return ((groups[input.Username] = groups[input.Username].filter((g) => g !== input.GroupName)), {})
    }
    throw new Error(`unexpected ${cmd.constructor.name}`)
  })
})

const call = async (
  routeKey: string,
  {
    sub = 'admin-1',
    group = '[admin]',
    body,
    path = {},
    query,
  }: {
    sub?: string
    group?: string
    body?: unknown
    path?: Record<string, string>
    query?: Record<string, string>
  } = {},
) => {
  const r = (await handler({
    routeKey,
    pathParameters: path,
    queryStringParameters: query,
    body: body === undefined ? undefined : JSON.stringify(body),
    requestContext: {
      authorizer: {
        jwt: {
          claims: {
            sub,
            'cognito:groups': group,
            iss: 'https://cognito-idp.eu-central-1.amazonaws.com/eu-central-1_TEST',
          },
          scopes: [],
        },
      },
    },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer)) as APIGatewayProxyStructuredResultV2
  return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : undefined }
}
const sessions = (course = 'cc') => table.filter((i) => i.PK === `COURSE#${course}` && i.SK.startsWith('SESSION#'))

const ROUTES = [
  'POST /admin/courses',
  'PUT /admin/courses/{courseId}',
  'DELETE /admin/courses/{courseId}',
  'POST /admin/courses/{courseId}/sessions',
  'PUT /admin/courses/{courseId}/sessions/{sessionId}',
  'DELETE /admin/courses/{courseId}/sessions/{sessionId}',
  'GET /admin/users',
  'PUT /admin/users/{userId}/roles',
]

test('student and lecturer tokens get 403 on every admin route, nothing changes', async () => {
  const before = JSON.stringify(table)
  for (const routeKey of ROUTES) {
    for (const [sub, group] of [
      ['stud-1', ''],
      ['lect-1', '[lecturer]'],
    ]) {
      const path = { courseId: 'cc', sessionId: '20261102T0700Z-aaaaaa', userId: sub }
      assert.equal(
        (await call(routeKey, { sub, group, path, body: { roles: ['admin'] } })).status,
        403,
        `${routeKey} ${group}`,
      )
    }
  }
  assert.equal(JSON.stringify(table), before)
  assert.deepEqual(groups['stud-1'], [])
})

test('repeatWeeks 14 creates 14 weekly sessions at the same local time across DST', async () => {
  const { status, body } = await call('POST /admin/courses/{courseId}/sessions', {
    path: { courseId: 'cc' },
    body: { start: '2026-10-19T08:00:00+02:00', end: '2026-10-19T09:30:00+02:00', room: 'A.1', repeatWeeks: 14 },
  })
  assert.equal(status, 201)
  assert.equal(body.items.length, 14)
  assert.equal(body.items[0].start, '2026-10-19T06:00:00.000Z') // 08:00 CEST
  assert.equal(body.items[1].start, '2026-10-26T07:00:00.000Z') // 08:00 CET, after the switch
  assert.equal(body.items[13].start, '2027-01-18T07:00:00.000Z')
  assert.ok(body.items.every((s: Item) => new Date(s.end).getTime() - new Date(s.start).getTime() === 90 * 60_000))
  assert.ok(body.items.every((s: Item) => s.courseName === 'Cloud Computing' && s.kind === 'lecture' && !s.cancelled))
  assert.equal(sessions().length, 2 + 14)
})

test('deleting a course removes all its sessions', async () => {
  assert.equal((await call('DELETE /admin/courses/{courseId}', { path: { courseId: 'cc' } })).status, 204)
  assert.equal(table.filter((i) => i.PK === 'COURSE#cc').length, 0)
  assert.equal((await call('DELETE /admin/courses/{courseId}', { path: { courseId: 'cc' } })).status, 204) // idempotent
})

test('renaming a course updates courseName in all sessions', async () => {
  const { status, body } = await call('PUT /admin/courses/{courseId}', {
    path: { courseId: 'cc' },
    body: { name: 'Cloud Engineering', programId: 'seb', semester: 7, lecturerId: 'lect-1' },
  })
  assert.equal(status, 200)
  assert.equal(body.id, 'cc')
  assert.ok(sessions().every((s) => s.courseName === 'Cloud Engineering'))
})

test('removing the lecturer drops the course from GSI2', async () => {
  await call('PUT /admin/courses/{courseId}', {
    path: { courseId: 'cc' },
    body: { name: 'Cloud Computing', programId: 'seb', semester: 7, lecturerId: null },
  })
  const meta = table.find((i) => i.PK === 'COURSE#cc' && i.SK === 'META')!
  assert.ok(!('GSI2PK' in meta) && !('lecturerId' in meta))
})

test('moving the start gives a new sessionId and keeps the lecturer status', async () => {
  const { status, body } = await call('PUT /admin/courses/{courseId}/sessions/{sessionId}', {
    path: { courseId: 'cc', sessionId: '20261102T0700Z-aaaaaa' },
    body: { start: '2026-11-03T07:00:00Z', end: '2026-11-03T08:30:00Z', room: 'F.201' },
  })
  assert.equal(status, 200)
  assert.match(body.id, /^20261103T0700Z-[a-z0-9]{6}$/)
  assert.equal(body.cancelled, true)
  assert.equal(body.note, 'krank')
  assert.ok(!table.some((i) => i.SK === 'SESSION#20261102T0700Z-aaaaaa'))
  assert.equal(sessions().length, 2)
})

test('same start keeps the sessionId', async () => {
  const { body } = await call('PUT /admin/courses/{courseId}/sessions/{sessionId}', {
    path: { courseId: 'cc', sessionId: '20261109T0700Z-bbbbbb' },
    body: { start: '2026-11-09T07:00:00Z', end: '2026-11-09T09:00:00Z', room: 'B.1', kind: 'lab' },
  })
  assert.equal(body.id, '20261109T0700Z-bbbbbb')
  assert.equal(sessions().find((s) => s.SK === 'SESSION#20261109T0700Z-bbbbbb')!.kind, 'lab')
})

test('course creation validates program, semester and lecturer and derives a readable id', async () => {
  const create = (body: Item) => call('POST /admin/courses', { body })
  const ok = await create({
    name: 'Übersetzerbau & Co',
    programId: 'seb',
    semester: 5,
    lecturerId: 'lect-1',
    lecturerName: 'Prof. B',
  })
  assert.equal(ok.status, 201)
  assert.equal(ok.body.id, 'seb-5-uebersetzerbau-co')
  const clash = await create({ name: 'Übersetzerbau & Co', programId: 'seb', semester: 5 })
  assert.match(clash.body.id, /^seb-5-uebersetzerbau-co-[0-9a-f]{4}$/)
  assert.equal((await create({ name: 'X', programId: 'nope', semester: 1 })).status, 400)
  assert.equal((await create({ name: 'X', programId: 'seb', semester: 8 })).status, 400)
  assert.equal((await create({ name: 'X', programId: 'seb', semester: 1, lecturerId: 'stud-1' })).status, 400)
  assert.equal((await create({ name: '', programId: 'seb', semester: 1 })).status, 400)
  assert.equal(courseIdFor({ name: 'x'.repeat(100), programId: 'seb', semester: 1 }).length, 64)
})

test('session input is validated', async () => {
  const create = (body: Item) => call('POST /admin/courses/{courseId}/sessions', { path: { courseId: 'cc' }, body })
  const base = { start: '2026-11-16T07:00:00Z', end: '2026-11-16T08:30:00Z', room: 'A.1' }
  assert.equal((await create({ ...base, end: '2026-11-16T06:00:00Z' })).status, 400)
  assert.equal((await create({ ...base, end: '2026-11-17T08:30:00Z' })).status, 400)
  assert.equal((await create({ ...base, repeatWeeks: 21 })).status, 400)
  assert.equal((await create({ ...base, kind: 'party' })).status, 400)
  assert.equal((await create({ ...base, room: '' })).status, 400)
  assert.equal(
    (await call('POST /admin/courses/{courseId}/sessions', { path: { courseId: 'nope' }, body: base })).status,
    404,
  )
})

test('roles: add and remove, no self-lockout, unknown user 404', async () => {
  const setRoles = (userId: string, roles: unknown) =>
    call('PUT /admin/users/{userId}/roles', { path: { userId }, body: { roles } })
  const added = await setRoles('stud-1', ['lecturer'])
  assert.equal(added.status, 200)
  assert.deepEqual(added.body, { id: 'stud-1', email: 'k6-001@loadtest.example.com', roles: ['lecturer'] })
  assert.deepEqual(groups['stud-1'], ['lecturer'])
  await setRoles('stud-1', [])
  assert.deepEqual(groups['stud-1'], [])

  assert.equal((await setRoles('admin-1', ['lecturer'])).status, 400)
  assert.deepEqual(groups['admin-1'], ['admin'])
  assert.equal((await setRoles('ghost', ['lecturer'])).status, 404)
  assert.equal((await setRoles('stud-1', ['root'])).status, 400)
  assert.equal((await setRoles('stud-1', ['admin', 'admin'])).status, 400)
})

test('findUsers matches the email prefix and reports roles', async () => {
  const { status, body } = await call('GET /admin/users', { query: { email: 'dozent' } })
  assert.equal(status, 200)
  assert.deepEqual(body.items, [{ id: 'lect-1', email: 'dozent.beispiel@loadtest.example.com', roles: ['lecturer'] }])
  assert.equal((await call('GET /admin/users', { query: { email: 'do' } })).status, 400)
  assert.equal((await call('GET /admin/users', { query: { email: 'a"b' } })).status, 400)
})
