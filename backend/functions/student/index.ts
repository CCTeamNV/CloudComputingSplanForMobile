// Lambda student: the signed-in user's subscriptions and the signature for the static catalog files (ADR 0013).
import { createSign, randomBytes } from 'node:crypto'
import { Logger } from '@aws-lambda-powertools/logger'
import { Tracer } from '@aws-lambda-powertools/tracer'
import { DeleteCommand, GetCommand, PutCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import { AdminDeleteUserCommand, CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider'
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda'
import type { Course } from '../../shared/api.ts'
import { db, getCourse, subscribedCourseIds, tableName, userItems } from '../../shared/db.ts'
import { error, json, noContent, userIdOf, userPoolOf, type Result } from '../../shared/http.ts'
import { icalTokenHash, keys } from '../../shared/keys.ts'

const logger = new Logger({ serviceName: 'student' })
const tracer = new Tracer({ serviceName: 'student' })
export const ssm = tracer.captureAWSv3Client(new SSMClient({}))
export const cognito = tracer.captureAWSv3Client(new CognitoIdentityProviderClient({}))
tracer.captureAWSv3Client(db)

export const MAX_SUBSCRIPTIONS = 50
const COURSE_ID = /^[a-z0-9-]{1,64}$/
const SIGNATURE_TTL_S = 3600

const env = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

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

// --- iCal token (ADR 0007) ---

const currentIcalHash = async (userId: string): Promise<string | undefined> =>
  (await db.send(new GetCommand({ TableName: tableName(), Key: keys.icalOfUser(userId) }))).Item?.tokenHash as
    string | undefined

/** New token, old one invalid in the same transaction; the plain token is returned once and never stored. */
const rotateIcalToken = async (userId: string, domain: string) => {
  const token = randomBytes(32).toString('base64url')
  const hash = icalTokenHash(token)
  const old = await currentIcalHash(userId)
  await db.send(
    new TransactWriteCommand({
      TransactItems: [
        { Put: { TableName: tableName(), Item: { ...keys.icalOfUser(userId), tokenHash: hash } } },
        { Put: { TableName: tableName(), Item: { ...keys.icalLookup(hash), userId } } },
        ...(old ? [{ Delete: { TableName: tableName(), Key: keys.icalLookup(old) } }] : []),
      ],
    }),
  )
  return json(201, { url: `https://${domain}/ical/${token}` })
}

const revokeIcalToken = async (userId: string) => {
  const old = await currentIcalHash(userId)
  if (old) {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          { Delete: { TableName: tableName(), Key: keys.icalOfUser(userId) } },
          { Delete: { TableName: tableName(), Key: keys.icalLookup(old) } },
        ],
      }),
    )
  }
  return noContent
}

// --- Account deletion (GDPR) ---

/**
 * Data first, Cognito user last: if anything fails, the account still exists and the user can simply retry,
 * and no personal data is left behind without an account.
 */
const deleteMe = async (userId: string, pool: string) => {
  const items = await userItems(userId)
  const tokenHash = items.find((i) => i.SK === 'ICAL')?.tokenHash as string | undefined
  if (tokenHash) await db.send(new DeleteCommand({ TableName: tableName(), Key: keys.icalLookup(tokenHash) }))
  // At most 50 subscriptions + the iCal item, so single deletes are fine.
  await Promise.all(
    items.map((i) => db.send(new DeleteCommand({ TableName: tableName(), Key: { PK: i.PK, SK: i.SK } }))),
  )
  try {
    await cognito.send(new AdminDeleteUserCommand({ UserPoolId: pool, Username: userId }))
  } catch (err) {
    if ((err as Error).name !== 'UserNotFoundException') throw err // already gone: deletion is idempotent
  }
  return noContent
}

export const handler = async (event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<Result> => {
  const userId = userIdOf(event)
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
      case 'POST /me/ical-token':
        return await rotateIcalToken(userId, event.requestContext.domainName)
      case 'DELETE /me/ical-token':
        return await revokeIcalToken(userId)
      case 'DELETE /me':
        return await deleteMe(userId, userPoolOf(event))
      default:
        return error(404, 'not_found', 'Route not found')
    }
  } catch (err) {
    // Route and error only: no user id, no token, no key material.
    logger.error('request failed', { routeKey: event.routeKey, error: err as Error })
    return error(500, 'internal', 'Internal error')
  }
}
