// Seed data and session generation, no AWS calls (tested in seed-plan.test.ts).
import { createHash } from 'node:crypto'
import { berlinMidnight, utcStamp } from '../backend/shared/keys.ts'

export const TEST_DOMAIN = 'loadtest.example.com'

export const programs = [
  { id: 'seb', name: 'Software Engineering (B.Sc.)', semesters: 7 },
  { id: 'wib', name: 'Wirtschaftsinformatik (B.Sc.)', semesters: 7 },
]

// Fictional people only (ADR 0012); all on the test domain so the pre-signup trigger accepts them.
export const staff = [
  { key: 'admin', email: `admin@${TEST_DOMAIN}`, group: 'admin' },
  { key: 'beispiel', email: `dozent.beispiel@${TEST_DOMAIN}`, group: 'lecturer', name: 'Prof. Dr. Erika Beispiel' },
  { key: 'muster', email: `dozent.muster@${TEST_DOMAIN}`, group: 'lecturer', name: 'Prof. Dr. Max Muster' },
] as const

export type Kind = 'lecture' | 'lab' | 'exercise' | 'exam'
type Slot = { weekday: number; from: string; to: string; room: string; kind: Kind } // weekday: 1 = Monday

export type SeedCourse = {
  id: string
  name: string
  shortName: string
  programId: string
  semester: number
  lecturer: 'beispiel' | 'muster'
  slots: Slot[]
}

export const courses: SeedCourse[] = [
  {
    id: 'seb-7-cloud-computing',
    name: 'Cloud Computing',
    shortName: 'CC',
    programId: 'seb',
    semester: 7,
    lecturer: 'beispiel',
    slots: [
      { weekday: 1, from: '08:00', to: '09:30', room: 'F.201', kind: 'lecture' },
      { weekday: 3, from: '14:00', to: '15:30', room: 'F.012', kind: 'lab' },
    ],
  },
  {
    id: 'seb-7-software-architektur',
    name: 'Software-Architektur',
    shortName: 'SWA',
    programId: 'seb',
    semester: 7,
    lecturer: 'muster',
    slots: [{ weekday: 2, from: '09:45', to: '11:15', room: 'A.105', kind: 'lecture' }],
  },
  {
    id: 'seb-7-it-sicherheit',
    name: 'IT-Sicherheit',
    shortName: 'ITS',
    programId: 'seb',
    semester: 7,
    lecturer: 'muster',
    slots: [
      { weekday: 4, from: '08:00', to: '09:30', room: 'F.201', kind: 'lecture' },
      { weekday: 4, from: '09:45', to: '11:15', room: 'F.201', kind: 'exercise' },
    ],
  },
  {
    id: 'seb-7-mobile-computing',
    name: 'Mobile Computing',
    shortName: 'MC',
    programId: 'seb',
    semester: 7,
    lecturer: 'beispiel',
    slots: [{ weekday: 5, from: '11:30', to: '13:00', room: 'B.302', kind: 'lecture' }],
  },
  {
    id: 'seb-1-programmieren-1',
    name: 'Programmieren 1',
    shortName: 'PR1',
    programId: 'seb',
    semester: 1,
    lecturer: 'muster',
    slots: [{ weekday: 1, from: '09:45', to: '11:15', room: 'A.001', kind: 'lecture' }],
  },
  {
    id: 'wib-3-datenbanken',
    name: 'Datenbanken',
    shortName: 'DB',
    programId: 'wib',
    semester: 3,
    lecturer: 'beispiel',
    slots: [{ weekday: 2, from: '14:00', to: '15:30', room: 'C.110', kind: 'lecture' }],
  },
]

const day = (iso: string) => new Date(`${iso}T00:00:00Z`)
const iso = (d: Date) => d.toISOString().slice(0, 10)

/** Lecture period of the semester containing `today` (approximate HHN dates), with the Christmas break. */
export const semesterOf = (today: Date): { start: string; end: string; breaks: [string, string][] } => {
  const y = today.getUTCFullYear()
  const m = today.getUTCMonth() + 1
  if (m >= 3 && m <= 8) return { start: `${y}-03-16`, end: `${y}-07-10`, breaks: [] }
  const ws = m >= 9 ? y : y - 1
  return { start: `${ws}-10-01`, end: `${ws + 1}-01-31`, breaks: [[`${ws}-12-23`, `${ws + 1}-01-06`]] }
}

/** Local Berlin wall time to UTC. Seeded sessions are on weekdays, so the Sunday DST switch never hits them. */
const berlinTime = (date: string, hhmm: string): Date => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(berlinMidnight(date).getTime() + (h * 60 + m) * 60_000)
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** Like newSessionId, but the suffix is derived from course and start, so reseeding hits the same key. */
export const seedSessionId = (courseId: string, start: Date): string => {
  const hash = createHash('sha256').update(`${courseId}|${start.toISOString()}`).digest()
  const suffix = Array.from(hash.subarray(0, 6), (b) => ALPHABET[b % ALPHABET.length]).join('')
  return `${utcStamp(start)}-${suffix}`
}

export type SeedSession = { courseId: string; id: string; start: string; end: string; room: string; kind: Kind }

/** Weekly sessions of all courses in the semester containing `today`. */
export const sessionsFor = (today: Date, list: SeedCourse[] = courses): SeedSession[] => {
  const { start, end, breaks } = semesterOf(today)
  const out: SeedSession[] = []
  for (let d = day(start); d <= day(end); d.setUTCDate(d.getUTCDate() + 1)) {
    const date = iso(d)
    if (breaks.some(([from, to]) => date >= from && date <= to)) continue
    const weekday = d.getUTCDay()
    for (const course of list) {
      for (const slot of course.slots.filter((s) => s.weekday === weekday)) {
        const s = berlinTime(date, slot.from)
        out.push({
          courseId: course.id,
          id: seedSessionId(course.id, s),
          start: s.toISOString(),
          end: berlinTime(date, slot.to).toISOString(),
          room: slot.room,
          kind: slot.kind,
        })
      }
    }
  }
  return out
}

export const testUserEmail = (i: number): string => `k6-${String(i).padStart(3, '0')}@${TEST_DOMAIN}`
