// DynamoDB access for the patterns in ADR 0003. Query only, never Scan.
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, paginateQuery, type QueryCommandInput } from '@aws-sdk/lib-dynamodb'
import type { Course, Program, Session } from './api.ts'
import { keys, sessionRange, SESSION_PREFIX, SUB_PREFIX } from './keys.ts'

export const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
})

export const tableName = (): string => {
  const name = process.env.TABLE_NAME
  if (!name) throw new Error('TABLE_NAME is not set')
  return name
}

type Item = Record<string, unknown>

/** All pages of a query (a single page is capped at 1 MB). */
const queryAll = async (input: Omit<QueryCommandInput, 'TableName'>): Promise<Item[]> => {
  const items: Item[] = []
  for await (const page of paginateQuery({ client: db }, { TableName: tableName(), ...input })) {
    items.push(...(page.Items ?? []))
  }
  return items
}

export const toCourse = (item: Item): Course => ({
  id: (item.PK as string).slice('COURSE#'.length),
  name: item.name as string,
  shortName: item.shortName as string | undefined,
  programId: item.programId as string,
  semester: item.semester as number,
  lecturerId: (item.lecturerId as string | undefined) ?? null,
  lecturerName: (item.lecturerName as string | undefined) ?? null,
})

export const toSession = (item: Item): Session => ({
  id: (item.SK as string).slice(SESSION_PREFIX.length),
  courseId: (item.PK as string).slice('COURSE#'.length),
  courseName: item.courseName as string,
  start: item.start as string,
  end: item.end as string,
  room: item.room as string,
  kind: (item.kind as Session['kind']) ?? 'lecture',
  cancelled: (item.cancelled as boolean | undefined) ?? false,
  originalRoom: (item.originalRoom as string | undefined) ?? null,
  note: (item.note as string | undefined) ?? null,
  updatedAt: item.updatedAt as string,
})

export const toProgram = (item: Item): Program => ({
  id: (item.SK as string).slice('PROGRAM#'.length),
  name: item.name as string,
  semesters: item.semesters as number,
})

/** All study programs. */
export const listPrograms = async (): Promise<Program[]> =>
  (
    await queryAll({ KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': keys.programs().PK } })
  ).map(toProgram)

/** A study program, or undefined if it does not exist. */
export const getProgram = async (programId: string): Promise<Program | undefined> => {
  const { Item } = await db.send(new GetCommand({ TableName: tableName(), Key: keys.program(programId) }))
  return Item && toProgram(Item)
}

/** All items of a course: META and every session (for rename and delete). */
export const courseItems = (courseId: string): Promise<Item[]> =>
  queryAll({ KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': keys.course(courseId).PK } })

/** A course, or undefined if it does not exist. */
export const getCourse = async (courseId: string): Promise<Course | undefined> => {
  const { Item } = await db.send(new GetCommand({ TableName: tableName(), Key: keys.course(courseId) }))
  return Item && toCourse(Item)
}

/** A session, or undefined if it does not exist. */
export const getSession = async (courseId: string, sessionId: string): Promise<Session | undefined> => {
  const { Item } = await db.send(new GetCommand({ TableName: tableName(), Key: keys.session(courseId, sessionId) }))
  return Item && toSession(Item)
}

/** All sessions of a course, sorted by start. */
export const allSessions = async (courseId: string): Promise<Session[]> =>
  (
    await queryAll({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :session)',
      ExpressionAttributeValues: { ':pk': keys.course(courseId).PK, ':session': SESSION_PREFIX },
    })
  ).map(toSession)

/** Courses of a program semester (GSI1). */
export const coursesByProgram = async (programId: string, semester: number): Promise<Course[]> =>
  (
    await queryAll({
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': keys.programSemester(programId, semester) },
    })
  ).map(toCourse)

/** Courses taught by a lecturer (GSI2). */
export const coursesOfLecturer = async (lecturerId: string): Promise<Course[]> =>
  (
    await queryAll({
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :pk',
      ExpressionAttributeValues: { ':pk': keys.lecturer(lecturerId) },
    })
  ).map(toCourse)

/** Sessions of a course on local days `from`..`to` (inclusive, `yyyy-MM-dd`), sorted by start. */
export const sessionsInRange = async (courseId: string, from: string, to: string): Promise<Session[]> => {
  const { lower, upper } = sessionRange(from, to)
  const items = await queryAll({
    KeyConditionExpression: 'PK = :pk AND SK BETWEEN :lower AND :upper',
    ExpressionAttributeValues: { ':pk': keys.course(courseId).PK, ':lower': lower, ':upper': upper },
  })
  return items.map(toSession) // the SK sorts by start, DynamoDB returns ascending
}

/** Course ids a user subscribed to. */
export const subscribedCourseIds = async (userId: string): Promise<string[]> =>
  (
    await queryAll({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sub)',
      ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sub': SUB_PREFIX },
      ProjectionExpression: 'SK',
    })
  ).map((item) => (item.SK as string).slice(SUB_PREFIX.length))
