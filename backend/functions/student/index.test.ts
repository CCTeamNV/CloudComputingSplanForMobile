import { beforeEach, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { createVerify, generateKeyPairSync } from 'node:crypto'
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { db } from '../../shared/db.ts'
import { icalTokenHash } from '../../shared/keys.ts'
import { catalogAccess, handler, MAX_SUBSCRIPTIONS, ssm } from './index.ts'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const pem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()

process.env.TABLE_NAME = 'table'
process.env.CATALOG_KEY_PARAM = '/splan/test/catalog-key'
process.env.CATALOG_KEY_PAIR_ID = 'K2TESTKEYID'
process.env.CATALOG_URL = 'https://d111.cloudfront.net'

type Item = Record<string, string>
let table: Item[]
let logs: string[]

beforeEach(() => {
  table = [
    { PK: 'COURSE#cc', SK: 'META', name: 'Cloud Computing', programId: 'seb', semester: '7' },
    { PK: 'COURSE#swa', SK: 'META', name: 'Software-Architektur', programId: 'seb', semester: '7' },
  ]
  logs = []
  const same = (a: Item, b: Item) => a.PK === b.PK && a.SK === b.SK
  mock.method(db, 'send', async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
    const { input } = cmd
    switch (cmd.constructor.name) {
      case 'GetCommand':
        return { Item: table.find((i) => same(i, input.Key as Item)) }
      case 'PutCommand':
        table = table.filter((i) => !same(i, input.Item as Item)).concat(input.Item as Item)
        return {}
      case 'DeleteCommand':
        table = table.filter((i) => !same(i, input.Key as Item))
        return {}
      case 'TransactWriteCommand':
        for (const t of input.TransactItems as { Put?: { Item: Item }; Delete?: { Key: Item } }[]) {
          if (t.Put) table = table.filter((i) => !same(i, t.Put!.Item)).concat(t.Put.Item)
          if (t.Delete) table = table.filter((i) => !same(i, t.Delete!.Key))
        }
        return {}
      default: {
        const v = input.ExpressionAttributeValues as Item
        return { Items: table.filter((i) => i.PK === v[':pk'] && i.SK.startsWith(v[':sub'] ?? '')) }
      }
    }
  })
  mock.method(ssm, 'send', async () => ({ Parameter: { Value: pem } }))
})

/** Runs fn with stdout and stderr captured into `logs` (the Powertools logger writes there). */
const captureLogs = async <T>(fn: () => Promise<T>): Promise<T> => {
  const capture = (chunk: string) => (logs.push(String(chunk)), true)
  const mocks = [mock.method(process.stdout, 'write', capture), mock.method(process.stderr, 'write', capture)]
  try {
    return await fn()
  } finally {
    for (const m of mocks) m.mock.restore()
  }
}

const call = async (routeKey: string, sub: string, courseId?: string) => {
  const result = (await handler({
    routeKey,
    pathParameters: courseId === undefined ? undefined : { courseId },
    requestContext: { domainName: 'api.example.com', authorizer: { jwt: { claims: { sub }, scopes: [] } } },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer)) as APIGatewayProxyStructuredResultV2
  return { status: result.statusCode, body: result.body ? JSON.parse(result.body) : undefined, raw: result.body ?? '' }
}
const list = (sub: string) => call('GET /me/subscriptions', sub)
const put = (sub: string, courseId: string) => call('PUT /me/subscriptions/{courseId}', sub, courseId)
const del = (sub: string, courseId: string) => call('DELETE /me/subscriptions/{courseId}', sub, courseId)

test('user A never sees subscriptions of user B', async () => {
  assert.equal((await put('user-a', 'cc')).status, 204)
  assert.equal((await put('user-b', 'swa')).status, 204)
  assert.deepEqual(
    (await list('user-a')).body.items.map((c: { id: string }) => c.id),
    ['cc'],
  )
  assert.deepEqual(
    (await list('user-b')).body.items.map((c: { id: string }) => c.id),
    ['swa'],
  )
  assert.equal((await del('user-b', 'cc')).status, 204) // B cannot remove A's subscription
  assert.equal((await list('user-a')).body.items.length, 1)
})

test('unknown or malformed course is 404', async () => {
  assert.equal((await put('user-a', 'does-not-exist')).status, 404)
  assert.equal((await put('user-a', '../USER#x')).status, 404)
  assert.equal((await put('user-a', 'does-not-exist')).body.code, 'not_found')
})

test('subscribe and unsubscribe are idempotent', async () => {
  await put('user-a', 'cc')
  await put('user-a', 'cc')
  assert.equal((await list('user-a')).body.items.length, 1)
  assert.equal((await del('user-a', 'cc')).status, 204)
  assert.equal((await del('user-a', 'cc')).status, 204)
  assert.equal((await list('user-a')).body.items.length, 0)
})

test('the 51st subscription is 409, re-subscribing at the limit is fine', async () => {
  for (let i = 0; i < MAX_SUBSCRIPTIONS; i++) table.push({ PK: 'USER#user-a', SK: `SUB#c${i}` })
  table.push({ PK: 'COURSE#c0', SK: 'META', name: 'c0', programId: 'seb', semester: '1' })
  const res = await put('user-a', 'cc')
  assert.equal(res.status, 409)
  assert.equal(res.body.code, 'conflict')
  assert.equal((await put('user-a', 'c0')).status, 204)
})

test('catalogAccess is a valid CloudFront custom policy signature for /catalog/*', async () => {
  const before = Date.now()
  const { body, raw } = await captureLogs(() => list('user-a'))
  const params = new URLSearchParams(body.catalogAccess.query)
  assert.equal(params.get('Key-Pair-Id'), 'K2TESTKEYID')

  const decode = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '=').replace(/~/g, '/'), 'base64')
  const policy = decode(params.get('Policy')!).toString()
  const statement = JSON.parse(policy).Statement[0]
  assert.equal(statement.Resource, 'https://d111.cloudfront.net/catalog/*')
  const expires = statement.Condition.DateLessThan['AWS:EpochTime'] * 1000
  assert.ok(expires > before + 3590_000 && expires <= Date.now() + 3600_000)
  assert.ok(Math.abs(new Date(body.catalogAccess.expiresAt).getTime() - expires) < 1000)

  assert.ok(
    createVerify('RSA-SHA1')
      .update(policy)
      .verify(publicKey, decode(params.get('Signature')!)),
  )
  assert.ok(!/[+=/]/.test(params.get('Policy')! + params.get('Signature')!), 'URL-safe base64')

  assert.ok(!raw.includes('PRIVATE KEY'))
  assert.ok(!logs.join('').includes('PRIVATE KEY'))
})

test('signature is stable for the same expiry, so it can be computed per request', () => {
  const at = new Date('2026-11-10T12:00:00Z')
  assert.deepEqual(catalogAccess(pem, 'K', 'https://x', at), catalogAccess(pem, 'K', 'https://x', at))
})

test('a failing dependency answers 500 without leaking details', async () => {
  mock.method(db, 'send', async () => {
    throw Object.assign(new Error('boom'), { name: 'ProvisionedThroughputExceededException' })
  })
  const { status, body } = await captureLogs(() => list('user-a'))
  assert.equal(status, 500)
  assert.deepEqual(body, { code: 'internal', message: 'Internal error' })
  assert.ok(logs.join('').includes('request failed'), 'error is logged')
  assert.ok(!logs.join('').includes('user-a'))
})

test('iCal token: returned once, stored only as hash, rotation and revocation invalidate the old one', async () => {
  const lookups = () => table.filter((i) => i.PK.startsWith('ICAL#'))
  const first = await call('POST /me/ical-token', 'user-a')
  assert.equal(first.status, 201)
  const token1 = first.body.url.match(/^https:\/\/api\.example\.com\/ical\/([A-Za-z0-9_-]{43})$/)?.[1]
  assert.ok(token1, first.body.url)
  assert.ok(!JSON.stringify(table).includes(token1), 'plain token is never stored')
  assert.deepEqual(
    lookups().map((i) => i.PK),
    [`ICAL#${icalTokenHash(token1)}`],
  )

  const second = await call('POST /me/ical-token', 'user-a')
  const token2 = second.body.url.split('/').pop()
  assert.notEqual(token2, token1)
  assert.deepEqual(
    lookups().map((i) => i.PK),
    [`ICAL#${icalTokenHash(token2)}`],
    'old token is gone',
  )

  await call('POST /me/ical-token', 'user-b')
  assert.equal((await call('DELETE /me/ical-token', 'user-a')).status, 204)
  assert.equal(lookups().length, 1, "only user B's token is left")
  assert.ok(!table.some((i) => i.PK === 'USER#user-a' && i.SK === 'ICAL'))
  assert.equal((await call('DELETE /me/ical-token', 'user-a')).status, 204) // idempotent
})
