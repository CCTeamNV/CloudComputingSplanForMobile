import type { components } from './schema'

export type Session = components['schemas']['Session']

// shortcut: static mock data matching docs/api.yaml, replace with getMySchedule in the plan view issue.
function today(hour: number, minute = 0): string {
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

export const mockSchedule: Session[] = [
  {
    id: 'mock-1',
    courseId: 'seb-7-cloud-computing',
    courseName: 'Cloud Computing',
    start: today(8),
    end: today(9, 30),
    room: 'F.201',
    kind: 'lecture',
    cancelled: false,
    originalRoom: null,
    note: null,
    updatedAt: today(7),
  },
  {
    id: 'mock-2',
    courseId: 'seb-7-it-security',
    courseName: 'IT-Sicherheit',
    start: today(9, 45),
    end: today(11, 15),
    room: 'A.112',
    kind: 'lecture',
    cancelled: false,
    originalRoom: 'A.008',
    note: null,
    updatedAt: today(7),
  },
  {
    id: 'mock-3',
    courseId: 'seb-7-software-architecture',
    courseName: 'Softwarearchitektur',
    start: today(14),
    end: today(15, 30),
    room: 'F.105',
    kind: 'exercise',
    cancelled: true,
    originalRoom: null,
    note: 'Krankheitsbedingt',
    updatedAt: today(7),
  },
]
