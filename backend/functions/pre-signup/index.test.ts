import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PreSignUpTriggerEvent } from 'aws-lambda'
import { handler, isAllowedEmail } from './index.ts'

const domains = ['hs-heilbronn.de', 'loadtest.example.com']

test('allows configured domains regardless of case', () => {
  assert.ok(isAllowedEmail('max@hs-heilbronn.de', domains))
  assert.ok(isAllowedEmail('Max.Muster@HS-Heilbronn.DE', domains))
  assert.ok(isAllowedEmail('k6-001@loadtest.example.com', domains))
})

test('allows subdomains of configured domains', () => {
  assert.ok(isAllowedEmail('max@stud.hs-heilbronn.de', domains))
})

test('rejects foreign and look-alike domains', () => {
  assert.ok(!isAllowedEmail('max@gmail.com', domains))
  assert.ok(!isAllowedEmail('max@evilhs-heilbronn.de', domains))
  assert.ok(!isAllowedEmail('max@hs-heilbronn.de.evil.com', domains))
  assert.ok(!isAllowedEmail('hs-heilbronn.de@gmail.com', domains))
  assert.ok(!isAllowedEmail('@hs-heilbronn.de', domains))
  assert.ok(!isAllowedEmail(undefined, domains))
  assert.ok(!isAllowedEmail('max@hs-heilbronn.de', []))
})

const event = (email: string) =>
  ({ request: { userAttributes: { email } }, response: {} }) as unknown as PreSignUpTriggerEvent

test('handler passes allowed sign-ups and rejects others with a readable message', async () => {
  process.env.ALLOWED_DOMAINS = 'hs-heilbronn.de, loadtest.example.com'
  const ok = event('max@hs-heilbronn.de')
  assert.equal(await handler(ok), ok)
  await assert.rejects(handler(event('max@gmail.com')), /Hochschul-E-Mail.*@hs-heilbronn\.de/)
})
