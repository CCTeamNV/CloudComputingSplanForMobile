// Secret iCal feed URL (ADR 0007): the API returns it once, the device keeps it until logout.
import { ICAL_URL } from '@/auth'
import { apiFetch } from './client'

export const storedIcalUrl = (): string | null => {
  try {
    return localStorage.getItem(ICAL_URL)
  } catch {
    return null
  }
}

const store = (url: string | null) => {
  try {
    if (url) localStorage.setItem(ICAL_URL, url)
    else localStorage.removeItem(ICAL_URL)
  } catch {
    // private mode: the link is shown now, just not remembered
  }
}

/** New secret URL; any previous one stops working. */
export async function rotateIcalUrl(): Promise<string> {
  const res = await apiFetch('/me/ical-token', { method: 'POST' })
  if (res.status !== 201) throw new Error(`HTTP ${res.status}`)
  const { url } = (await res.json()) as { url: string }
  store(url)
  return url
}

export async function revokeIcalUrl(): Promise<void> {
  const res = await apiFetch('/me/ical-token', { method: 'DELETE' })
  if (res.status !== 204) throw new Error(`HTTP ${res.status}`)
  store(null)
}

/** `webcal://` makes iOS and macOS offer to subscribe directly. */
export const webcalUrl = (url: string): string => url.replace(/^https:/, 'webcal:')

/** Clipboard API where allowed, otherwise the old select-and-copy way (older iOS Safari, non-secure contexts). */
export async function copyText(text: string, input?: HTMLInputElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    if (!input) return false
    input.focus()
    input.setSelectionRange(0, text.length)
    return document.execCommand('copy')
  }
}
