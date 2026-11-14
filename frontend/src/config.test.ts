import { describe, expect, test } from 'vitest'
import { parseConfig } from './config'

const valid = {
  apiUrl: 'https://api.example.com//',
  authDomain: 'https://auth.example.com/',
  userPoolClientId: 'abc123',
  region: 'eu-central-1', // extra keys from Terraform are ignored
}

describe('parseConfig', () => {
  test('accepts absolute URLs and strips trailing slashes', () => {
    expect(parseConfig(valid)).toEqual({
      apiUrl: 'https://api.example.com',
      authDomain: 'https://auth.example.com',
      userPoolClientId: 'abc123',
    })
  })

  test.each([null, {}, { ...valid, apiUrl: 42 }, { ...valid, apiUrl: '/relative' }])('rejects apiUrl in %j', (raw) => {
    expect(() => parseConfig(raw)).toThrow(/apiUrl/)
  })

  test('requires authDomain and client id', () => {
    expect(() => parseConfig({ ...valid, authDomain: 'nope' })).toThrow(/authDomain/)
    expect(() => parseConfig({ ...valid, userPoolClientId: '' })).toThrow(/userPoolClientId/)
  })
})
