// Login via Cognito managed login: authorization code flow with PKCE, no auth library (ADR 0009).
import type { Config } from './config'

type Tokens = { accessToken: string; idToken: string; refreshToken: string; expiresAt: number }
export type Session = { userId: string; email: string; roles: string[] }

const TOKENS = 'splan.auth'
const PENDING = 'splan.pkce' // verifier and state of a login in progress (sessionStorage, this tab only)

// --- PKCE (RFC 7636) ---

export const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const randomString = (bytes: number) => base64url(crypto.getRandomValues(new Uint8Array(bytes)))

export const challengeFor = async (verifier: string): Promise<string> =>
  base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))

/** Must match a callback URL of the app client (Terraform: `<frontend>/`, `http://localhost:5173/`). */
const redirectUri = () => `${location.origin}/`

// --- Token storage ---

const load = (): Tokens | null => {
  try {
    return JSON.parse(localStorage.getItem(TOKENS) ?? 'null') as Tokens | null
  } catch {
    return null
  }
}
const save = (t: Tokens) => localStorage.setItem(TOKENS, JSON.stringify(t))
export const clearSession = () => localStorage.removeItem(TOKENS)

const claims = (jwt: string): Record<string, unknown> => {
  const payload = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))))
}

/** Who is signed in, from the stored tokens; only for showing and hiding UI, the backend checks everything. */
export const currentSession = (): Session | null => {
  const t = load()
  if (!t) return null
  const id = claims(t.idToken)
  const groups = claims(t.accessToken)['cognito:groups']
  return {
    userId: String(id.sub),
    email: String(id.email ?? ''),
    roles: Array.isArray(groups) ? groups.map(String) : [],
  }
}

// --- Cognito endpoints ---

type TokenResponse = { access_token: string; id_token: string; refresh_token?: string; expires_in: number }

class TokenError extends Error {}

const tokenRequest = async (cfg: Config, params: Record<string, string>): Promise<TokenResponse> => {
  const res = await fetch(`${cfg.authDomain}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.userPoolClientId, ...params }),
  })
  if (!res.ok) throw new TokenError(`token endpoint: HTTP ${res.status}`)
  return (await res.json()) as TokenResponse
}

const toTokens = (r: TokenResponse, previousRefresh = ''): Tokens => ({
  accessToken: r.access_token,
  idToken: r.id_token,
  refreshToken: r.refresh_token ?? previousRefresh, // a refresh response carries no new refresh token
  expiresAt: Date.now() + r.expires_in * 1000,
})

/** Redirects to the Cognito login (or sign-up) page in German. */
export async function startLogin(cfg: Config, mode: 'login' | 'signup' = 'login'): Promise<void> {
  const verifier = randomString(32)
  const state = randomString(16)
  sessionStorage.setItem(PENDING, JSON.stringify({ verifier, state }))
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.userPoolClientId,
    redirect_uri: redirectUri(),
    scope: 'openid email',
    state,
    code_challenge: await challengeFor(verifier),
    code_challenge_method: 'S256',
    lang: 'de',
  })
  location.assign(`${cfg.authDomain}/${mode === 'signup' ? 'signup' : 'oauth2/authorize'}?${params}`)
}

/** Readable German text for an error Cognito sends back to the redirect URL. */
export const loginErrorMessage = (error: string, description: string | null): string => {
  // The pre-sign-up Lambda's message arrives as "PreSignUp failed with error <message>".
  const lambda = description?.match(/PreSignUp failed with error (.+)/)?.[1]
  if (lambda) return lambda.replace(/\.?\s*$/, '.')
  if (error === 'access_denied') return 'Die Anmeldung wurde abgebrochen.'
  return 'Die Anmeldung hat nicht geklappt. Bitte versuche es noch einmal.'
}

/**
 * Finishes a login when Cognito redirected back with `?code=` (or `?error=`).
 * Returns an error message for the user, or null (also when this was no redirect).
 */
export async function completeLogin(cfg: Config, url = new URL(location.href)): Promise<string | null> {
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  if (!code && !error) return null
  history.replaceState(null, '', url.pathname) // the code is single-use; keep it out of history and bookmarks
  const pending = JSON.parse(sessionStorage.getItem(PENDING) ?? 'null') as { verifier: string; state: string } | null
  sessionStorage.removeItem(PENDING)
  if (error) return loginErrorMessage(error, url.searchParams.get('error_description'))
  // state protects against a login CSRF: only a redirect we started is accepted.
  if (!pending || pending.state !== url.searchParams.get('state')) {
    return 'Die Anmeldung ist abgelaufen. Bitte melde dich erneut an.'
  }
  try {
    save(
      toTokens(
        await tokenRequest(cfg, {
          grant_type: 'authorization_code',
          code: code!,
          redirect_uri: redirectUri(),
          code_verifier: pending.verifier,
        }),
      ),
    )
    return null
  } catch {
    return 'Die Anmeldung hat nicht geklappt. Bitte versuche es noch einmal.'
  }
}

let refreshing: Promise<string | null> | null = null

/**
 * A valid access token, refreshed shortly before it expires; null when the session is over
 * (no tokens, or Cognito rejected the refresh token). Network errors are thrown, the session stays.
 */
export async function getAccessToken(cfg: Config): Promise<string | null> {
  const t = load()
  if (!t) return null
  if (t.expiresAt - 60_000 > Date.now()) return t.accessToken
  refreshing ??= tokenRequest(cfg, { grant_type: 'refresh_token', refresh_token: t.refreshToken })
    .then((r) => {
      const next = toTokens(r, t.refreshToken)
      save(next)
      return next.accessToken
    })
    .catch((err: unknown) => {
      if (!(err instanceof TokenError)) throw err
      clearSession()
      return null
    })
    .finally(() => (refreshing = null))
  return refreshing
}

/** Ends the session locally and at Cognito (refresh token revoked, login cookie cleared). */
export async function logout(cfg: Config, revoke = true): Promise<void> {
  const t = load()
  if (revoke && t) {
    await fetch(`${cfg.authDomain}/oauth2/revoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: t.refreshToken, client_id: cfg.userPoolClientId }),
    }).catch(() => undefined) // signing out locally must work offline too
  }
  clearSession()
  const params = new URLSearchParams({ client_id: cfg.userPoolClientId, logout_uri: redirectUri() })
  location.assign(`${cfg.authDomain}/logout?${params}`)
}
