// Cognito Pre-Sign-up trigger: only university mail domains may register (ADR 0006).
import type { PreSignUpTriggerEvent } from 'aws-lambda'

const allowedDomains = (): string[] =>
  (process.env.ALLOWED_DOMAINS ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)

/** True if the address belongs to an allowed domain or one of its subdomains (e.g. stud.hs-heilbronn.de). */
export const isAllowedEmail = (email: string | undefined, domains: string[]): boolean => {
  const at = email?.lastIndexOf('@') ?? -1
  if (!email || at < 1) return false
  const domain = email.slice(at + 1).toLowerCase()
  return domains.some((d) => domain === d || domain.endsWith(`.${d}`))
}

export const handler = async (event: PreSignUpTriggerEvent): Promise<PreSignUpTriggerEvent> => {
  const domains = allowedDomains()
  if (!isAllowedEmail(event.request.userAttributes.email, domains)) {
    // Cognito shows this as "PreSignUp failed with error <message>"; no address in logs.
    throw new Error(`Registrierung nur mit Hochschul-E-Mail-Adresse möglich (@${domains[0] ?? 'hs-heilbronn.de'}).`)
  }
  return event
}
