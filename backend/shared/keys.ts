// Key layout of the single table (ADR 0003).
import { randomInt } from 'node:crypto'

export const keys = {
  programs: () => ({ PK: 'PROGRAMS' }),
  program: (programId: string) => ({ PK: 'PROGRAMS', SK: `PROGRAM#${programId}` }),
  course: (courseId: string) => ({ PK: `COURSE#${courseId}`, SK: 'META' }),
  session: (courseId: string, sessionId: string) => ({ PK: `COURSE#${courseId}`, SK: `SESSION#${sessionId}` }),
  subscription: (userId: string, courseId: string) => ({ PK: `USER#${userId}`, SK: `SUB#${courseId}` }),
  icalOfUser: (userId: string) => ({ PK: `USER#${userId}`, SK: 'ICAL' }),
  icalLookup: (tokenHash: string) => ({ PK: `ICAL#${tokenHash}`, SK: 'META' }),
  // GSI1: courses of a program semester, GSI2: courses of a lecturer
  programSemester: (programId: string, semester: number) => `PROGRAM#${programId}#SEM#${semester}`,
  lecturer: (lecturerId: string) => `LECTURER#${lecturerId}`,
}

export const SESSION_PREFIX = 'SESSION#'
export const SUB_PREFIX = 'SUB#'

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
const SESSION_ID = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})Z-[a-z0-9]{6}$/

/** `yyyyMMddTHHmmZ` in UTC, the sortable prefix of a sessionId. */
export const utcStamp = (date: Date): string => date.toISOString().slice(0, 16).replace(/[-:]/g, '') + 'Z'

/** `<start UTC as yyyyMMddTHHmmZ>-<6 random chars>`, so the SK sorts by start. */
export const newSessionId = (start: Date): string => {
  let suffix = ''
  for (let i = 0; i < 6; i++) suffix += ALPHABET[randomInt(ALPHABET.length)]
  return `${utcStamp(start)}-${suffix}`
}

/** Start time encoded in a sessionId (minute precision); throws on malformed ids. */
export const sessionStart = (sessionId: string): Date => {
  const m = SESSION_ID.exec(sessionId)
  if (!m) throw new Error('invalid sessionId')
  const [, y, mo, d, h, mi] = m
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:00Z`)
}

export const isSessionId = (value: string): boolean => SESSION_ID.test(value)

const TIME_ZONE = 'Europe/Berlin'

/** Offset of German local time from UTC at `instant`, in ms (+1 h in winter, +2 h in summer). */
export const berlinOffsetMs = (instant: Date): number => {
  const offset = new Intl.DateTimeFormat('en', { timeZone: TIME_ZONE, timeZoneName: 'longOffset' })
    .formatToParts(instant)
    .find((p) => p.type === 'timeZoneName')!.value // "GMT+01:00" or "GMT+02:00"
  const [, sign, hh, mm] = /GMT([+-])(\d{2}):(\d{2})/.exec(offset)!
  return (sign === '-' ? -1 : 1) * (Number(hh) * 60 + Number(mm)) * 60_000
}

/** UTC instant of local midnight in Germany for a `yyyy-MM-dd` date (handles DST). */
export const berlinMidnight = (date: string): Date => {
  const utcMidnight = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(utcMidnight.getTime()) || utcMidnight.toISOString().slice(0, 10) !== date) {
    throw new Error('invalid date')
  }
  return new Date(utcMidnight.getTime() - berlinOffsetMs(utcMidnight))
}

/** Local German calendar day (`yyyy-MM-dd`) of an instant. */
export const berlinDate = (instant: Date): string =>
  new Date(instant.getTime() + berlinOffsetMs(instant)).toISOString().slice(0, 10)

/** Same German wall-clock time `weeks` weeks later, across DST changes. */
export const addWeeksBerlin = (instant: Date, weeks: number): Date => {
  const naive = new Date(instant.getTime() + weeks * 7 * 86_400_000)
  return new Date(naive.getTime() + berlinOffsetMs(instant) - berlinOffsetMs(naive))
}

/**
 * SK bounds for `between` covering local days `from`..`to` (both inclusive).
 * The upper bound is the next local midnight without suffix, so a session starting exactly then sorts after it.
 */
export const sessionRange = (from: string, to: string): { lower: string; upper: string } => {
  const dayAfter = new Date(`${to}T00:00:00Z`)
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1)
  return {
    lower: SESSION_PREFIX + utcStamp(berlinMidnight(from)),
    upper: SESSION_PREFIX + utcStamp(berlinMidnight(dayAfter.toISOString().slice(0, 10))),
  }
}
