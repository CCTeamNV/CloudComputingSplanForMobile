import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handler } from './index.ts'

test('health returns ok', async () => {
  const res = await handler()
  assert.equal(typeof res, 'object')
  if (typeof res !== 'object') return
  assert.equal(res.statusCode, 200)
  assert.equal(JSON.parse(res.body ?? '').status, 'ok')
})
