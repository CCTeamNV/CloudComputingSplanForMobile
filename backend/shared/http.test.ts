import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda'
import { groupsOf } from './http.ts'

const event = (groups: unknown) =>
  ({
    requestContext: { authorizer: { jwt: { claims: { sub: 'u', 'cognito:groups': groups } } } },
  }) as unknown as APIGatewayProxyEventV2WithJWTAuthorizer

test('groups claim in all shapes the HTTP API sends', () => {
  assert.deepEqual(groupsOf(event('[lecturer admin]')), ['lecturer', 'admin'])
  assert.deepEqual(groupsOf(event('[lecturer]')), ['lecturer'])
  assert.deepEqual(groupsOf(event('lecturer')), ['lecturer'])
  assert.deepEqual(groupsOf(event(['admin'])), ['admin'])
  assert.deepEqual(groupsOf(event(undefined)), [])
  assert.deepEqual(groupsOf(event('[]')), [])
})
