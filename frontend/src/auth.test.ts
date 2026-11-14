import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  challengeFor,
  completeLogin,
  currentSession,
  getAccessToken,
  loginErrorMessage,
  logout,
  startLogin,
} from './auth'
import type { Config } from './config'

const cfg: Config = { apiUrl: 'https://api.test', authDomain: 'https://auth.test', userPoolClientId: 'client-1' }

const memoryStorage = () => {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  }
}
const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '')
const jwt = (claims: object) => `h.${b64(claims)}.s`

let assigned: string[]
beforeEach(() => {
  assigned = []
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('sessionStorage', memoryStorage())
  vi.stubGlobal('location', {
    origin: 'https://app.test',
    href: 'https://app.test/',
    assign: (u: string) => assigned.push(u),
  })
  vi.stubGlobal('history', { replaceState: vi.fn() })
})
afterEach(() => vi.unstubAllGlobals())

const tokenResponse = (over: object = {}) =>
  new Response(
    JSON.stringify({
      access_token: jwt({ 'cognito:groups': ['lecturer'] }),
      id_token: jwt({ sub: 'u1', email: 'max@hs-heilbronn.de' }),
      refresh_token: 'refresh-1',
      expires_in: 3600,
      ...over,
    }),
  )

test('PKCE challenge matches the RFC 7636 example', async () => {
  expect(await challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  )
})

describe('login round trip', () => {
  test('startLogin redirects to the German login page with PKCE and state', async () => {
    await startLogin(cfg)
    const url = new URL(assigned[0])
    expect(url.origin + url.pathname).toBe('https://auth.test/oauth2/authorize')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: 'code',
      client_id: 'client-1',
      redirect_uri: 'https://app.test/',
      code_challenge_method: 'S256',
      lang: 'de',
    })
    await startLogin(cfg, 'signup')
    expect(new URL(assigned[1]).pathname).toBe('/signup')
  })

  test('completeLogin exchanges the code with the verifier and stores the session', async () => {
    await startLogin(cfg)
    const state = new URL(assigned[0]).searchParams.get('state')!
    const fetchMock = vi.fn(async () => tokenResponse())
    vi.stubGlobal('fetch', fetchMock)

    expect(await completeLogin(cfg, new URL(`https://app.test/?code=abc&state=${state}`))).toBeNull()
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = new URLSearchParams(String(init.body))
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code')).toBe('abc')
    expect(body.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(history.replaceState).toHaveBeenCalled()
    expect(currentSession()).toEqual({ userId: 'u1', email: 'max@hs-heilbronn.de', roles: ['lecturer'] })
  })

  test('a redirect with a foreign state is rejected without calling Cognito', async () => {
    await startLogin(cfg)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await completeLogin(cfg, new URL('https://app.test/?code=abc&state=evil'))).toMatch(/abgelaufen/)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(currentSession()).toBeNull()
  })

  test('no redirect parameters: nothing happens', async () => {
    expect(await completeLogin(cfg, new URL('https://app.test/courses'))).toBeNull()
    expect(history.replaceState).not.toHaveBeenCalled()
  })
})

describe('error messages are readable', () => {
  test('pre-sign-up Lambda message without the Cognito prefix', () => {
    expect(
      loginErrorMessage(
        'invalid_request',
        'PreSignUp failed with error Registrierung nur mit Hochschul-E-Mail-Adresse möglich (@hs-heilbronn.de).',
      ),
    ).toBe('Registrierung nur mit Hochschul-E-Mail-Adresse möglich (@hs-heilbronn.de).')
  })
  test('cancel and unknown errors', () => {
    expect(loginErrorMessage('access_denied', null)).toMatch(/abgebrochen/)
    expect(loginErrorMessage('server_error', 'internal')).not.toMatch(/internal/)
  })
})

describe('token refresh', () => {
  const store = (expiresAt: number) =>
    localStorage.setItem(
      'splan.auth',
      JSON.stringify({ accessToken: 'old', idToken: jwt({ sub: 'u1' }), refreshToken: 'refresh-1', expiresAt }),
    )

  test('a valid token is used without calling Cognito', async () => {
    store(Date.now() + 600_000)
    vi.stubGlobal('fetch', vi.fn())
    expect(await getAccessToken(cfg)).toBe('old')
  })

  test('an expiring token is refreshed once, the refresh token is kept', async () => {
    store(Date.now() + 30_000)
    const fetchMock = vi.fn(async () => tokenResponse({ access_token: 'new', refresh_token: undefined }))
    vi.stubGlobal('fetch', fetchMock)
    const [a, b] = await Promise.all([getAccessToken(cfg), getAccessToken(cfg)])
    expect([a, b]).toEqual(['new', 'new'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(localStorage.getItem('splan.auth')!).refreshToken).toBe('refresh-1')
  })

  test('a rejected refresh token ends the session', async () => {
    store(Date.now() - 1)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":"invalid_grant"}', { status: 400 })),
    )
    expect(await getAccessToken(cfg)).toBeNull()
    expect(currentSession()).toBeNull()
  })

  test('a network error keeps the session', async () => {
    store(Date.now() - 1)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    )
    await expect(getAccessToken(cfg)).rejects.toThrow('offline')
    expect(localStorage.getItem('splan.auth')).not.toBeNull()
  })
})

test('logout revokes the refresh token, clears the session and leaves via Cognito', async () => {
  localStorage.setItem(
    'splan.auth',
    JSON.stringify({ accessToken: 'a', idToken: 'i', refreshToken: 'refresh-1', expiresAt: 0 }),
  )
  const fetchMock = vi.fn(async () => new Response(null))
  vi.stubGlobal('fetch', fetchMock)
  await logout(cfg)
  expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe('https://auth.test/oauth2/revoke')
  expect(localStorage.getItem('splan.auth')).toBeNull()
  expect(assigned[0]).toBe('https://auth.test/logout?client_id=client-1&logout_uri=https%3A%2F%2Fapp.test%2F')
})
