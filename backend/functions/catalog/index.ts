// Publisher: rewrites the static files under /catalog/ when programs, courses or sessions change (ADR 0013).
// Triggered by the table's DynamoDB Stream (filtered to PROGRAMS and COURSE#), or with {"rebuild": true} for all files.
import { Logger } from '@aws-lambda-powertools/logger'
import { Tracer } from '@aws-lambda-powertools/tracer'
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { DynamoDBRecord, DynamoDBStreamEvent } from 'aws-lambda'
import type { Course, PublicCourse, PublicSession, Session } from '../../shared/api.ts'
import { allSessions, coursesByProgram, db, getCourse, listPrograms } from '../../shared/db.ts'

const logger = new Logger({ serviceName: 'catalog' })
const tracer = new Tracer({ serviceName: 'catalog' })
export const s3 = tracer.captureAWSv3Client(new S3Client({}))
tracer.captureAWSv3Client(db)

const bucket = (): string => {
  const name = process.env.CATALOG_BUCKET
  if (!name) throw new Error('CATALOG_BUCKET is not set')
  return name
}

/** Files to rewrite: course lists as `<programId>/<semester>`, sessions per course id. */
export type Targets = { programs: boolean; courseLists: Set<string>; courses: Set<string> }

type Image = NonNullable<DynamoDBRecord['dynamodb']>['NewImage']
const listOf = (image: Image): string | undefined =>
  image?.programId?.S && image.semester?.N ? `${image.programId.S}/${image.semester.N}` : undefined

/** Which files a batch touches; each file once, however many records hit it. */
export const targetsOf = (records: DynamoDBRecord[]): Targets => {
  const targets: Targets = { programs: false, courseLists: new Set(), courses: new Set() }
  for (const { dynamodb } of records) {
    const pk = dynamodb?.Keys?.PK?.S ?? ''
    if (pk === 'PROGRAMS') targets.programs = true
    if (!pk.startsWith('COURSE#')) continue
    targets.courses.add(pk.slice('COURSE#'.length))
    // A course moving to another program or semester leaves the old list and joins the new one.
    if (dynamodb?.Keys?.SK?.S === 'META') {
      for (const list of [listOf(dynamodb.OldImage), listOf(dynamodb.NewImage)]) if (list) targets.courseLists.add(list)
    }
  }
  return targets
}

/** Every file, for the rebuild after a lost stream batch. */
const everything = async (): Promise<Targets> => {
  const targets: Targets = { programs: true, courseLists: new Set(), courses: new Set() }
  for (const program of await listPrograms()) {
    for (let semester = 1; semester <= program.semesters; semester++) {
      targets.courseLists.add(`${program.id}/${semester}`)
      for (const course of await coursesByProgram(program.id, semester)) targets.courses.add(course.id)
    }
  }
  return targets
}

// Allow-lists, so a new internal field never ends up in a file that anyone with a signature can read.
export const publicCourse = (c: Course): PublicCourse => ({
  id: c.id,
  name: c.name,
  shortName: c.shortName,
  programId: c.programId,
  semester: c.semester,
  lecturerName: c.lecturerName,
})

export const publicSession = (s: Session): PublicSession => ({
  id: s.id,
  courseId: s.courseId,
  courseName: s.courseName,
  start: s.start,
  end: s.end,
  room: s.room,
  kind: s.kind,
  cancelled: s.cancelled,
  originalRoom: s.originalRoom,
  updatedAt: s.updatedAt,
})

const put = (file: string, items: unknown[]) =>
  s3.send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: `catalog/${file}.json`,
      Body: JSON.stringify({ items }),
      ContentType: 'application/json',
      CacheControl: 'public,max-age=60',
    }),
  )

// Reads the current state instead of applying the event, so retries and duplicates give the same files.
const publishSessions = async (courseId: string): Promise<unknown> =>
  (await getCourse(courseId))
    ? put(`sessions/${courseId}`, (await allSessions(courseId)).map(publicSession))
    : s3.send(new DeleteObjectCommand({ Bucket: bucket(), Key: `catalog/sessions/${courseId}.json` }))

const publishCourseList = async (list: string): Promise<unknown> => {
  const [programId, semester] = list.split('/')
  return put(`courses/${list}`, (await coursesByProgram(programId, Number(semester))).map(publicCourse))
}

export const handler = async (event: DynamoDBStreamEvent | { rebuild: true }): Promise<void> => {
  const targets =
    'rebuild' in event && event.rebuild === true
      ? await everything()
      : targetsOf((event as DynamoDBStreamEvent).Records)
  // Counts only: course ids are no personal data, but the log stays small.
  logger.info('publish', {
    programs: targets.programs,
    courseLists: targets.courseLists.size,
    courses: targets.courses.size,
  })
  // Any failure fails the whole batch; the stream retries it and rewriting is idempotent.
  await Promise.all([
    targets.programs && listPrograms().then((items) => put('programs', items)),
    ...[...targets.courseLists].map(publishCourseList),
    ...[...targets.courses].map(publishSessions),
  ])
}
