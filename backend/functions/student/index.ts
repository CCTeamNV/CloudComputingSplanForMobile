// Lambda student: the signed-in user's subscriptions and the signature for the static catalog files (ADR 0013).
import { createSign } from 'node:crypto'
import { Logger } from '@aws-lambda-powertools/logger'
import { Tracer } from '@aws-lambda-powertools/tracer'
import { DeleteCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { ApiError, Course } from '../../shared/api.ts'
import { db, getCourse, subscribedCourseIds, tableName } from '../../shared/db.ts'
import { keys } from '../../shared/keys.ts'

const logger = new Logger({ serviceName: 'student' })
const tracer = new Tracer({ serviceName: 'student' })
export const ssm = tracer.captureAWSv3Client(new SSMClient({}))
tracer.captureAWSv3Client(db)

export const MAX_SUBSCRIPTIONS = 50
const COURSE_ID = /^[a-z0-9-]{1,64}$/
const SIGNATURE_TTL_S = 3600

const env = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

const json = (statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})
const error = (statusCode: number, code: ApiError['code'], message: string) => json(statusCode, { code, message })
const noContent: APIGatewayProxyStructuredResultV2 = { statusCode: 204 }

// --- CloudFront signed URL parameters (custom policy) ---

let privateKey: Promise<string> | undefined
/** Loaded once per container; the key never leaves this function (not logged, not returned). */
const signingKey = (): Promise<string> =>
  (privateKey ??= ssm
    .send(new GetParameterCommand({ Name: env('CATALOG_KEY_PARAM'), WithDecryption: true }))
    .then((r) => r.Parameter!.Value!)
    .catch((err: unknown) => {
      privateKey = undefined // retry on the next request instead of caching the failure
      throw err
    }))

/** CloudFront's URL-safe base64 variant. */
const cfBase64 = (data: Buffer | string): string =>
  Buffer.from(data).toString('base64').replace(/\+/g, '-').replace(/=/g, '_').replace(/\//g, '~')

/** `Policy`, `Signature` and `Key-Pair-Id` for every file under `<catalogUrl>/catalog/`, valid until `expires`. */
export const catalogAccess = (pem: string, keyPairId: string, catalogUrl: string, expires: Date) => {
  const policy = JSON.stringify({
    Statement: [
      {
        Resource: `${catalogUrl}/catalog/*`,
        Condition: { DateLessThan: { 'AWS:EpochTime': Math.floor(expires.getTime() / 1000) } },
      },
    ],
  })
  const signature = createSign('RSA-SHA1').update(policy).sign(pem) // CloudFront signed URLs require SHA-1
  return {
    query: `Policy=${cfBase64(policy)}&Signature=${cfBase64(signature)}&Key-Pair-Id=${keyPairId}`,
    expiresAt: expires.toISOString(),
  }
}

// --- Routes ---

const listMySubscriptions = async (userId: string) => {
  const ids = await subscribedCourseIds(userId)
  // At most 50 point reads; a course deleted by an admin simply drops out.
  const courses = (await Promise.all(ids.map(getCourse))).filter((c): c is Course => c !== undefined)
  const expires = new Date(Date.now() + SIGNATURE_TTL_S * 1000)
  return json(200, {
    items: courses,
    catalogAccess: catalogAccess(await signingKey(), env('CATALOG_KEY_PAIR_ID'), env('CATALOG_URL'), expires),
  })
}

const subscribe = async (userId: string, courseId: string) => {
  if (!(await getCourse(courseId))) return error(404, 'not_found', 'Course not found')
  const ids = await subscribedCourseIds(userId)
  // shortcut: count-then-put, two parallel requests can reach 51; good enough for a per-user soft limit.
  if (!ids.includes(courseId) && ids.length >= MAX_SUBSCRIPTIONS) {
    return error(409, 'conflict', `Subscription limit (${MAX_SUBSCRIPTIONS}) reached`)
  }
  await db.send(new PutCommand({ TableName: tableName(), Item: keys.subscription(userId, courseId) }))
  return noContent
}

const unsubscribe = async (userId: string, courseId: string) => {
  await db.send(new DeleteCommand({ TableName: tableName(), Key: keys.subscription(userId, courseId) }))
  return noContent
}

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> => {
  // The user id comes only from the validated JWT, never from path or body.
  const userId = event.requestContext.authorizer.jwt.claims.sub as string
  const courseId = event.pathParameters?.courseId ?? ''
  try {
    switch (event.routeKey) {
      case 'GET /me/subscriptions':
        return await listMySubscriptions(userId)
      case 'PUT /me/subscriptions/{courseId}':
        return COURSE_ID.test(courseId)
          ? await subscribe(userId, courseId)
          : error(404, 'not_found', 'Course not found')
      case 'DELETE /me/subscriptions/{courseId}':
        return COURSE_ID.test(courseId) ? await unsubscribe(userId, courseId) : noContent
      default:
        return error(404, 'not_found', 'Route not found')
    }
  } catch (err) {
    // Route and error only: no user id, no token, no key material.
    logger.error('request failed', { routeKey: event.routeKey, error: err as Error })
    return error(500, 'internal', 'Internal error')
  }
}
