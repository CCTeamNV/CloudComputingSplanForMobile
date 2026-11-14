// Lambda ical: personal calendar feed behind a secret token URL, no JWT (ADR 0007).
import { Logger } from '@aws-lambda-powertools/logger'
import { Tracer } from '@aws-lambda-powertools/tracer'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { Session } from '../../shared/api.ts'
import { db, sessionsInRange, subscribedCourseIds, tableName } from '../../shared/db.ts'
import { berlinDate, ICAL_TOKEN, icalTokenHash, keys } from '../../shared/keys.ts'

const logger = new Logger({ serviceName: 'ical' })
const tracer = new Tracer({ serviceName: 'ical' })
tracer.captureAWSv3Client(db)

const KIND: Record<Session['kind'], string> = { lecture: 'Vorlesung', lab: 'Labor', exercise: 'Übung', exam: 'Prüfung' }

/** RFC 5545 TEXT escaping. */
export const escapeText = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** RFC 5545 line folding: at most 75 octets per line, never splitting a UTF-8 character. */
export const fold = (line: string): string => {
  const parts: string[] = []
  let current = ''
  for (const ch of line) {
    const limit = parts.length === 0 ? 75 : 74 // continuation lines start with a space
    if (Buffer.byteLength(current + ch) > limit) {
      parts.push(current)
      current = ''
    }
    current += ch
  }
  parts.push(current)
  return parts.join('\r\n ')
}

/** UTC in iCal basic format, e.g. 20261102T070000Z; avoids VTIMEZONE blocks entirely. */
export const icalTime = (iso: string): string =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')

export const toIcs = (sessions: Session[], now: Date): string => {
  const events = sessions.flatMap((s) => {
    const kind = KIND[s.kind] ?? s.kind
    const summary = `${s.cancelled ? 'Abgesagt: ' : ''}${s.courseName} (${kind})`
    const description = [s.cancelled && 'Termin abgesagt', s.originalRoom && `Raumänderung: vorher ${s.originalRoom}`]
      .filter(Boolean)
      .join('\n')
    return [
      'BEGIN:VEVENT',
      `UID:${s.courseId}-${s.id}@splan`,
      `DTSTAMP:${icalTime(now.toISOString())}`,
      `LAST-MODIFIED:${icalTime(s.updatedAt)}`,
      `DTSTART:${icalTime(s.start)}`,
      `DTEND:${icalTime(s.end)}`,
      `SUMMARY:${escapeText(summary)}`,
      `LOCATION:${escapeText(s.room)}`,
      ...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
      `STATUS:${s.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
      'END:VEVENT',
    ]
  })
  return (
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//HHN//SPLAN for Mobile//DE',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Stundenplan',
      'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
      'X-PUBLISHED-TTL:PT1H',
      ...events,
      'END:VCALENDAR',
    ]
      .map(fold)
      .join('\r\n') + '\r\n'
  )
}

const notFound: APIGatewayProxyStructuredResultV2 = {
  statusCode: 404,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code: 'not_found', message: 'Not found' }),
}

const shiftDays = (date: string, days: number): string => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
  // Never log the token or the raw path; the API access log uses the routeKey only.
  const token = event.pathParameters?.token ?? ''
  try {
    // Same 404 for malformed, unknown and revoked tokens, so probing learns nothing.
    if (!ICAL_TOKEN.test(token)) return notFound
    const { Item } = await db.send(
      new GetCommand({ TableName: tableName(), Key: keys.icalLookup(icalTokenHash(token)) }),
    )
    if (!Item) return notFound

    const now = new Date()
    const today = berlinDate(now)
    const from = shiftDays(today, -28)
    const to = shiftDays(today, 183) // about 6 months
    const courseIds = await subscribedCourseIds(Item.userId as string)
    const sessions = (await Promise.all(courseIds.map((id) => sessionsInRange(id, from, to)))).flat()
    sessions.sort((a, b) => a.start.localeCompare(b.start))

    return {
      statusCode: 200,
      headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, max-age=900' },
      body: toIcs(sessions, now),
    }
  } catch (err) {
    logger.error('feed failed', { error: err as Error })
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: '{"code":"internal","message":"Internal error"}',
    }
  }
}
