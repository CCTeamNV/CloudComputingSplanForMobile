import { describe, expect, test } from 'vitest'
import { parseConfig } from './config'

describe('parseConfig', () => {
  test('accepts an absolute URL and strips trailing slashes', () => {
    expect(parseConfig({ apiUrl: 'https://api.example.com//' })).toEqual({ apiUrl: 'https://api.example.com' })
  })

  test.each([null, {}, { apiUrl: 42 }, { apiUrl: '/relative' }])('rejects %j', (raw) => {
    expect(() => parseConfig(raw)).toThrow(/apiUrl/)
  })
})
