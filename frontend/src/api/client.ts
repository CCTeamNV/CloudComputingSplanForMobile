// API calls with the access token; the config is loaded once at startup (main.tsx).
import { clearSession, getAccessToken } from '@/auth'
import type { Config } from '@/config'

let config: Config | undefined

export const initApi = (c: Config) => {
  config = c
}

export const appConfig = (): Config => {
  if (!config) throw new Error('config not loaded')
  return config
}

/** Session gone (refresh token expired or revoked): back to the login screen. */
const toLogin = (): never => {
  clearSession()
  location.assign('/')
  throw new Error('session expired')
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = (await getAccessToken(appConfig())) ?? toLogin()
  const res = await fetch(`${appConfig().apiUrl}${path}`, {
    ...init,
    headers: { ...init.headers, authorization: `Bearer ${token}` },
  })
  if (res.status === 401) toLogin()
  return res
}
