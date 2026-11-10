// Lambda lecturer: own courses, cancel/restore own sessions and change their room (ADR 0006).
import { Logger } from '@aws-lambda-powertools/logger'
import { Tracer } from '@aws-lambda-powertools/tracer'
import { UpdateCommand } from '@aws-sdk/lib-dynamodb'
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda'
import type { LecturerSessionPatch, Session } from '../../shared/api.ts'
import { coursesOfLecturer, db, getCourse, getSession, tableName, toSession } from '../../shared/db.ts'
import { error, groupsOf, json, userIdOf, type Result } from '../../shared/http.ts'
import { isSessionId, keys } from '../../shared/keys.ts'

const logger = new Logger({ serviceName: 'lecturer' })
const tracer = new Tracer({ serviceName: 'lecturer' })
tracer.captureAWSv3Client(db)

const COURSE_ID = /^[a-z0-9-]{1,64}$/

/** Validates the body against LecturerSessionPatch; unknown fields (e.g. start/end) are rejected. */
export const parsePatch = (body: string | undefined): LecturerSessionPatch | string => {
  let patch: unknown
  try {
    patch = JSON.parse(body ?? '')
  } catch {
    return 'Body must be JSON'
  }
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return 'Body must be an object'
  const p = patch as Record<string, unknown>
  const unknown = Object.keys(p).filter((k) => !['cancelled', 'room', 'note'].includes(k))
  if (unknown.length) return `Not changeable here: ${unknown.join(', ')}`
  if (Object.keys(p).length === 0) return 'Nothing to change'
  if ('cancelled' in p && typeof p.cancelled !== 'boolean') return 'cancelled must be a boolean'
  if ('room' in p && (typeof p.room !== 'string' || p.room.trim().length < 1 || p.room.length > 40)) {
    return 'room must be 1-40 characters'
  }
  if ('note' in p && p.note !== null && (typeof p.note !== 'string' || p.note.length > 200)) {
    return 'note must be at most 200 characters or null'
  }
  return p as LecturerSessionPatch
}

/** Update expression for a patch; `originalRoom` keeps the first room and disappears when it is restored. */
export const updateFor = (current: Session, patch: LecturerSessionPatch, now: string) => {
  const set: string[] = ['updatedAt = :now']
  const remove: string[] = []
  const values: Record<string, unknown> = { ':now': now }
  if (patch.cancelled !== undefined) {
    set.push('cancelled = :cancelled')
    values[':cancelled'] = patch.cancelled
  }
  if (patch.room !== undefined) {
    const room = patch.room.trim()
    set.push('room = :room')
    values[':room'] = room
    const original = current.originalRoom ?? current.room
    if (room === original) remove.push('originalRoom')
    else if (!current.originalRoom) {
      set.push('originalRoom = :original')
      values[':original'] = current.room
    }
  }
  if (patch.note !== undefined) {
    if (patch.note === null || patch.note === '') remove.push('note')
    else {
      set.push('note = :note')
      values[':note'] = patch.note
    }
  }
  return {
    UpdateExpression: `SET ${set.join(', ')}` + (remove.length ? ` REMOVE ${remove.join(', ')}` : ''),
    ExpressionAttributeValues: values,
  }
}

const updateSession = async (userId: string, courseId: string, sessionId: string, body: string | undefined) => {
  if (!COURSE_ID.test(courseId) || !isSessionId(sessionId)) return error(404, 'not_found', 'Session not found')
  const course = await getCourse(courseId)
  if (!course) return error(404, 'not_found', 'Session not found')
  // Ownership before anything else, so a foreign lecturer learns nothing about the session.
  if (course.lecturerId !== userId) return error(403, 'forbidden', 'Not the lecturer of this course')
  const patch = parsePatch(body)
  if (typeof patch === 'string') return error(400, 'bad_request', patch)
  const current = await getSession(courseId, sessionId)
  if (!current) return error(404, 'not_found', 'Session not found')

  const { Attributes } = await db.send(
    new UpdateCommand({
      TableName: tableName(),
      Key: keys.session(courseId, sessionId),
      ...updateFor(current, patch, new Date().toISOString()),
      ConditionExpression: 'attribute_exists(PK)', // never create a session through an update
      ReturnValues: 'ALL_NEW',
    }),
  )
  return json(200, toSession(Attributes!))
}

export const handler = async (event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<Result> => {
  if (!groupsOf(event).includes('lecturer')) return error(403, 'forbidden', 'Lecturers only')
  const userId = userIdOf(event)
  const { courseId = '', sessionId = '' } = event.pathParameters ?? {}
  try {
    switch (event.routeKey) {
      case 'GET /lecturer/courses':
        return json(200, { items: await coursesOfLecturer(userId) })
      case 'PATCH /lecturer/courses/{courseId}/sessions/{sessionId}':
        return await updateSession(
          userId,
          courseId,
          sessionId,
          event.isBase64Encoded && event.body ? Buffer.from(event.body, 'base64').toString() : event.body,
        )
      default:
        return error(404, 'not_found', 'Route not found')
    }
  } catch (err) {
    if ((err as Error).name === 'ConditionalCheckFailedException') return error(404, 'not_found', 'Session not found')
    // Route and error only: no user id, no token, no note text.
    logger.error('request failed', { routeKey: event.routeKey, error: err as Error })
    return error(500, 'internal', 'Internal error')
  }
}
