// Runtime config written by Terraform as /config.json, so one build serves every environment.
export type Config = {
  apiUrl: string
  /** Cognito managed login, e.g. https://splan-dev-123.auth.eu-central-1.amazoncognito.com */
  authDomain: string
  userPoolClientId: string
}

const absoluteUrl = (raw: Record<string, unknown>, key: keyof Config): string => {
  const value = raw[key]
  if (typeof value !== 'string' || !URL.canParse(value)) throw new Error(`config.json: ${key} must be an absolute URL`)
  return value.replace(/\/+$/, '')
}

export function parseConfig(raw: unknown): Config {
  const r = (raw ?? {}) as Record<string, unknown>
  const apiUrl = absoluteUrl(r, 'apiUrl')
  const authDomain = absoluteUrl(r, 'authDomain')
  if (typeof r.userPoolClientId !== 'string' || !r.userPoolClientId) {
    throw new Error('config.json: userPoolClientId is missing')
  }
  return { apiUrl, authDomain, userPoolClientId: r.userPoolClientId }
}

export async function loadConfig(): Promise<Config> {
  const res = await fetch('/config.json', { cache: 'no-store' })
  if (!res.ok) throw new Error(`config.json: HTTP ${res.status}`)
  return parseConfig(await res.json())
}
