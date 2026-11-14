// Lambda admin: courses, sessions and roles; group admin only (ADR 0006, 0008).
import { randomBytes } from 'node:crypto'
import { Logger } from '@aws-lambda-powertools/logger'
import { Tracer } from '@aws-lambda-powertools/tracer'
import {
  AdminAddUserToGroupCommand,
  AdminListGroupsForUserCommand,
  AdminRemoveUserFromGroupCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider'
import {
  BatchWriteCommand,
  DeleteCommand,
  PutCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda'
import type { Course, CourseInput, Session, SessionInput } from '../../shared/api.ts'
import { courseItems, db, getCourse, getProgram, getSession, tableName, toCourse, toSession } from '../../shared/db.ts'
import { bodyObject, error, groupsOf, json, noContent, userIdOf, userPoolOf, type Result } from '../../shared/http.ts'
import {
  addWeeksBerlin,
  berlinDate,
  isSessionId,
  keys,
  newSessionId,
  SESSION_PREFIX,
  utcStamp,
} from '../../shared/keys.ts'

const logger = new Logger({ serviceName: 'admin' })
const tracer = new Tracer({ serviceName: 'admin' })
export const cognito = tracer.captureAWSv3Client(new CognitoIdentityProviderClient({}))
tracer.captureAWSv3Client(db)

const ROLES = ['lecturer', 'admin'] as const
const KINDS = ['lecture', 'lab', 'exercise', 'exam']
const COURSE_ID = /^[a-z0-9-]{1,64}$/

class BadRequest extends Error {}
const bad = (message: string): never => {
  throw new BadRequest(message)
}

// --- Validation (CourseInput, SessionInput) ---

const str = (v: unknown, field: string, min: number, max: number): string =>
  typeof v === 'string' && v.trim().length >= min && v.length <= max
    ? v.trim()
    : bad(`${field} must be ${min}-${max} characters`)

const optionalStr = (v: unknown, field: string, max: number): string | null =>
  v === undefined || v === null || v === '' ? null : str(v, field, 1, max)

export const parseCourse = async (pool: string, b: Record<string, unknown>): Promise<CourseInput> => {
  const name = str(b.name, 'name', 1, 120)
  const shortName = optionalStr(b.shortName, 'shortName', 20) ?? undefined
  const programId = str(b.programId, 'programId', 1, 64)
  const semester = b.semester
  if (!Number.isInteger(semester) || (semester as number) < 1 || (semester as number) > 10) {
    bad('semester must be an integer 1-10')
  }
  const program = await getProgram(programId)
  if (!program) bad('unknown programId')
  if ((semester as number) > program!.semesters) bad(`program has only ${program!.semesters} semesters`)
  const lecturerId = optionalStr(b.lecturerId, 'lecturerId', 64)
  if (lecturerId && !(await groupsOfUser(pool, lecturerId)).includes('lecturer')) bad('lecturerId is not a lecturer')
  return {
    name,
    shortName,
    programId,
    semester: semester as number,
    lecturerId,
    lecturerName: optionalStr(b.lecturerName, 'lecturerName', 120),
  }
}

export const parseSession = (b: Record<string, unknown>): SessionInput & { repeatWeeks: number } => {
  const start = new Date(typeof b.start === 'string' ? b.start : NaN)
  const end = new Date(typeof b.end === 'string' ? b.end : NaN)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) bad('start and end must be date-time strings')
  if (end <= start) bad('end must be after start')
  if (berlinDate(start) !== berlinDate(end)) bad('start and end must be on the same day')
  const kind = (b.kind ?? 'lecture') as SessionInput['kind']
  if (!KINDS.includes(kind as string)) bad(`kind must be one of ${KINDS.join(', ')}`)
  const repeatWeeks = b.repeatWeeks ?? 1
  if (!Number.isInteger(repeatWeeks) || (repeatWeeks as number) < 1 || (repeatWeeks as number) > 20) {
    bad('repeatWeeks must be an integer 1-20')
  }
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    room: str(b.room, 'room', 1, 40),
    kind,
    repeatWeeks: repeatWeeks as number,
  }
}

// --- Courses ---

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** Readable id like the seed's (`seb-7-cloud-computing`), at most 64 chars. */
export const courseIdFor = (c: CourseInput, suffix = ''): string =>
  `${c.programId}-${c.semester}-${slug(c.name)}`.slice(0, 64 - suffix.length).replace(/-$/, '') + suffix

const courseItem = (id: string, c: CourseInput) => ({
  ...keys.course(id),
  // Empty optional fields are left out instead of stored as NULL (removeUndefinedValues drops undefined).
  ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v ?? undefined])),
  GSI1PK: keys.programSemester(c.programId, c.semester),
  GSI2PK: c.lecturerId ? keys.lecturer(c.lecturerId) : undefined, // removeUndefinedValues drops it
})

const createCourse = async (pool: string, body: Record<string, unknown>) => {
  const input = await parseCourse(pool, body)
  // Name clash: retry once with a random suffix instead of overwriting another course.
  for (const suffix of ['', `-${randomBytes(2).toString('hex')}`]) {
    const id = courseIdFor(input, suffix)
    try {
      await db.send(
        new PutCommand({
          TableName: tableName(),
          Item: courseItem(id, input),
          ConditionExpression: 'attribute_not_exists(PK)',
        }),
      )
      return json(201, toCourse(courseItem(id, input)))
    } catch (err) {
      if ((err as Error).name !== 'ConditionalCheckFailedException') throw err
    }
  }
  return error(409, 'conflict', 'Course id already taken, try another name')
}

const updateCourse = async (pool: string, courseId: string, body: Record<string, unknown>) => {
  const before = await getCourse(courseId)
  if (!before) return error(404, 'not_found', 'Course not found')
  const input = await parseCourse(pool, body)
  await db.send(
    new PutCommand({
      TableName: tableName(),
      Item: courseItem(courseId, input),
      ConditionExpression: 'attribute_exists(PK)',
    }),
  )
  if (input.name !== before.name) {
    // Sessions carry the course name for the schedule view (denormalized).
    const sessions = (await courseItems(courseId)).filter((i) => (i.SK as string).startsWith(SESSION_PREFIX))
    await Promise.all(
      sessions.map((s) =>
        db.send(
          new UpdateCommand({
            TableName: tableName(),
            Key: { PK: s.PK, SK: s.SK },
            UpdateExpression: 'SET courseName = :name',
            ConditionExpression: 'attribute_exists(PK)',
            ExpressionAttributeValues: { ':name': input.name },
          }),
        ),
      ),
    )
  }
  return json(200, toCourse(courseItem(courseId, input)))
}

/** Deletes in chunks of 25 and retries what DynamoDB left unprocessed. */
const deleteAll = async (itemKeys: Record<string, unknown>[]) => {
  for (let i = 0; i < itemKeys.length; i += 25) {
    let requests = itemKeys.slice(i, i + 25).map((k) => ({ DeleteRequest: { Key: { PK: k.PK, SK: k.SK } } }))
    for (let attempt = 0; requests.length; attempt++) {
      if (attempt === 5) throw new Error('BatchWrite left unprocessed items')
      const { UnprocessedItems } = await db.send(new BatchWriteCommand({ RequestItems: { [tableName()]: requests } }))
      requests = (UnprocessedItems?.[tableName()] ?? []) as typeof requests
      if (requests.length) await new Promise((r) => setTimeout(r, 100 * 2 ** attempt))
    }
  }
}

const deleteCourse = async (courseId: string) => {
  // Sessions first, META last: if this fails halfway, the course still exists and can be deleted again.
  const items = await courseItems(courseId)
  await deleteAll(items.filter((i) => i.SK !== 'META'))
  await deleteAll(items.filter((i) => i.SK === 'META'))
  return noContent
}

// --- Sessions ---

const sessionItem = (courseId: string, id: string, course: Course, s: SessionInput, keep: Partial<Session> = {}) => ({
  ...keys.session(courseId, id),
  courseName: course.name,
  start: s.start,
  end: s.end,
  room: s.room,
  kind: s.kind,
  cancelled: keep.cancelled ?? false,
  originalRoom: keep.originalRoom ?? undefined,
  note: keep.note ?? undefined,
  updatedAt: new Date().toISOString(),
})

const createSessions = async (courseId: string, body: Record<string, unknown>) => {
  const course = await getCourse(courseId)
  if (!course) return error(404, 'not_found', 'Course not found')
  const { repeatWeeks, ...input } = parseSession(body)
  const duration = new Date(input.end).getTime() - new Date(input.start).getTime()
  const items = Array.from({ length: repeatWeeks }, (_, week) => {
    const start = addWeeksBerlin(new Date(input.start), week) // same local time across DST
    const s = { ...input, start: start.toISOString(), end: new Date(start.getTime() + duration).toISOString() }
    return sessionItem(courseId, newSessionId(start), course, s)
  })
  await Promise.all(items.map((Item) => db.send(new PutCommand({ TableName: tableName(), Item }))))
  return json(201, { items: items.map(toSession) })
}

const updateSession = async (courseId: string, sessionId: string, body: Record<string, unknown>) => {
  const [course, current] = await Promise.all([getCourse(courseId), getSession(courseId, sessionId)])
  if (!course || !current) return error(404, 'not_found', 'Session not found')
  const { repeatWeeks: _ignored, ...input } = parseSession(body)
  // The sessionId starts with the start time, so a new start means a new key (ADR 0003).
  const sameKey = sessionId.startsWith(utcStamp(new Date(input.start)))
  const id = sameKey ? sessionId : newSessionId(new Date(input.start))
  // Admin edits the plan; cancellation, note and room change of the lecturer stay.
  const Item = sessionItem(courseId, id, course, input, current)
  if (sameKey) {
    await db.send(new PutCommand({ TableName: tableName(), Item, ConditionExpression: 'attribute_exists(PK)' }))
  } else {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          { Put: { TableName: tableName(), Item, ConditionExpression: 'attribute_not_exists(PK)' } },
          {
            Delete: {
              TableName: tableName(),
              Key: keys.session(courseId, sessionId),
              ConditionExpression: 'attribute_exists(PK)',
            },
          },
        ],
      }),
    )
  }
  return json(200, toSession(Item))
}

const deleteSession = async (courseId: string, sessionId: string) => {
  await db.send(new DeleteCommand({ TableName: tableName(), Key: keys.session(courseId, sessionId) }))
  return noContent
}

// --- Users and roles ---

const groupsOfUser = async (pool: string, userId: string): Promise<string[]> => {
  try {
    const { Groups } = await cognito.send(new AdminListGroupsForUserCommand({ UserPoolId: pool, Username: userId }))
    return (Groups ?? []).map((g) => g.GroupName!)
  } catch (err) {
    if ((err as Error).name === 'UserNotFoundException') return []
    throw err
  }
}

const toUser = async (pool: string, u: UserType) => {
  const id = u.Attributes?.find((a) => a.Name === 'sub')?.Value ?? u.Username!
  const roles = (await groupsOfUser(pool, u.Username!)).filter((g) => (ROLES as readonly string[]).includes(g))
  return { id, email: u.Attributes?.find((a) => a.Name === 'email')?.Value ?? '', roles }
}

const findUsers = async (pool: string, prefix: string | undefined) => {
  if (!prefix || prefix.length < 3) return error(400, 'bad_request', 'email must have at least 3 characters')
  if (/["\\]/.test(prefix)) return error(400, 'bad_request', 'email contains invalid characters')
  const { Users = [] } = await cognito.send(
    new ListUsersCommand({ UserPoolId: pool, Filter: `email ^= "${prefix}"`, Limit: 20 }),
  )
  return json(200, { items: await Promise.all(Users.map((u) => toUser(pool, u))) })
}

const setUserRoles = async (pool: string, callerId: string, userId: string, body: Record<string, unknown>) => {
  const roles = body.roles
  if (!Array.isArray(roles) || !roles.every((r) => (ROLES as readonly string[]).includes(r))) {
    return error(400, 'bad_request', `roles must be a list of ${ROLES.join(', ')}`)
  }
  if (new Set(roles).size !== roles.length) return error(400, 'bad_request', 'roles must be unique')
  if (userId === callerId && !roles.includes('admin')) {
    return error(400, 'bad_request', 'You cannot remove admin from yourself')
  }
  if (/["\\]/.test(userId)) return error(404, 'not_found', 'User not found')
  const { Users = [] } = await cognito.send(
    new ListUsersCommand({ UserPoolId: pool, Filter: `sub = "${userId}"`, Limit: 1 }),
  )
  const user = Users[0]
  if (!user) return error(404, 'not_found', 'User not found')
  const current = await groupsOfUser(pool, user.Username!)
  const UserPoolId = pool
  await Promise.all([
    ...ROLES.filter((r) => roles.includes(r) && !current.includes(r)).map((GroupName) =>
      cognito.send(new AdminAddUserToGroupCommand({ UserPoolId, Username: user.Username!, GroupName })),
    ),
    ...ROLES.filter((r) => !roles.includes(r) && current.includes(r)).map((GroupName) =>
      cognito.send(new AdminRemoveUserFromGroupCommand({ UserPoolId, Username: user.Username!, GroupName })),
    ),
  ])
  // Takes effect with the user's next token (refresh), the access token carries the groups.
  return json(200, { id: userId, email: user.Attributes?.find((a) => a.Name === 'email')?.Value ?? '', roles })
}

// --- Routing ---

export const handler = async (event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<Result> => {
  if (!groupsOf(event).includes('admin')) return error(403, 'forbidden', 'Admins only')
  const { courseId = '', sessionId = '', userId = '' } = event.pathParameters ?? {}
  if (event.pathParameters?.courseId !== undefined && !COURSE_ID.test(courseId)) {
    return error(404, 'not_found', 'Course not found')
  }
  if (event.pathParameters?.sessionId !== undefined && !isSessionId(sessionId)) {
    return error(404, 'not_found', 'Session not found')
  }
  const body = () => {
    const b = bodyObject(event)
    return typeof b === 'string' ? bad(b) : b
  }
  try {
    switch (event.routeKey) {
      case 'POST /admin/courses':
        return await createCourse(userPoolOf(event), body())
      case 'PUT /admin/courses/{courseId}':
        return await updateCourse(userPoolOf(event), courseId, body())
      case 'DELETE /admin/courses/{courseId}':
        return await deleteCourse(courseId)
      case 'POST /admin/courses/{courseId}/sessions':
        return await createSessions(courseId, body())
      case 'PUT /admin/courses/{courseId}/sessions/{sessionId}':
        return await updateSession(courseId, sessionId, body())
      case 'DELETE /admin/courses/{courseId}/sessions/{sessionId}':
        return await deleteSession(courseId, sessionId)
      case 'GET /admin/users':
        return await findUsers(userPoolOf(event), event.queryStringParameters?.email)
      case 'PUT /admin/users/{userId}/roles':
        return await setUserRoles(userPoolOf(event), userIdOf(event), userId, body())
      default:
        return error(404, 'not_found', 'Route not found')
    }
  } catch (err) {
    if (err instanceof BadRequest) return error(400, 'bad_request', err.message)
    if ((err as Error).name === 'ConditionalCheckFailedException') return error(404, 'not_found', 'Not found')
    if ((err as Error).name === 'TransactionCanceledException')
      return error(409, 'conflict', 'Session changed meanwhile')
    // Route and error only: no emails, no user ids, no tokens.
    logger.error('request failed', { routeKey: event.routeKey, error: err as Error })
    return error(500, 'internal', 'Internal error')
  }
}
