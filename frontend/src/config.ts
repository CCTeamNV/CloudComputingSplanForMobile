// Runtime config written by Terraform as /config.json, so one build serves every environment.
export type Config = {
  apiUrl: string
}

export function parseConfig(raw: unknown): Config {
  const apiUrl = (raw as { apiUrl?: unknown } | null)?.apiUrl
  if (typeof apiUrl !== 'string' || !URL.canParse(apiUrl)) {
    throw new Error('config.json: apiUrl must be an absolute URL')
  }
  return { apiUrl: apiUrl.replace(/\/+$/, '') }
}

export async function loadConfig(): Promise<Config> {
  const res = await fetch('/config.json', { cache: 'no-store' })
  if (!res.ok) throw new Error(`config.json: HTTP ${res.status}`)
  return parseConfig(await res.json())
}
