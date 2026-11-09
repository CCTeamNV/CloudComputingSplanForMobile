// Seeds programs, courses, sessions and Cognito users into one environment. Idempotent: existing items are kept.
// Usage: SEED_PASSWORD=... node --experimental-strip-types scripts/seed.ts --env dev [--users 10]
import { execFileSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb'
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  type AttributeType,
} from '@aws-sdk/client-cognito-identity-provider'
import { keys } from '../backend/shared/keys.ts'
import { courses, isValidPassword, programs, sessionsFor, staff, testUserEmail } from './seed-plan.ts'

const { values } = parseArgs({
  options: { env: { type: 'string' }, users: { type: 'string', default: '10' } },
})
const env = values.env
const userCount = Number(values.users)
if (env !== 'dev' && env !== 'prod') throw new Error('--env dev|prod is required')
if (!Number.isInteger(userCount) || userCount < 0 || userCount > 1000) throw new Error('--users must be 0..1000')

// Passwords never live in the repo; all seeded users share this one.
const password = process.env.SEED_PASSWORD
// Checked before any AWS call, otherwise users are created and the run stops at the password.
if (!password || !isValidPassword(password)) {
  throw new Error('SEED_PASSWORD is missing or invalid (min. 12 chars, upper/lower case and a digit)')
}

const outputs = JSON.parse(
  execFileSync(
    'terraform',
    [`-chdir=${new URL(`../infra/envs/${env}`, import.meta.url).pathname}`, 'output', '-json'],
    {
      encoding: 'utf8',
    },
  ),
) as Record<string, { value: string }>
const TableName = outputs.table_name?.value
const UserPoolId = outputs.user_pool_id?.value
if (!TableName || !UserPoolId) throw new Error(`terraform outputs table_name/user_pool_id missing in envs/${env}`)

const region = 'eu-central-1'
const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region }))
const cognito = new CognitoIdentityProviderClient({ region })

const sub = (attrs: AttributeType[] | undefined): string => {
  const value = attrs?.find((a) => a.Name === 'sub')?.Value
  if (!value) throw new Error('user without sub')
  return value
}

const counts = { created: 0, existing: 0, usersCreated: 0, usersExisting: 0 }

/** Returns the Cognito sub; creates the user without sending mail if missing. */
const ensureUser = async (email: string, group?: string): Promise<string> => {
  let id: string
  try {
    const user = await cognito.send(new AdminGetUserCommand({ UserPoolId, Username: email }))
    id = sub(user.UserAttributes)
    // Left over from an aborted run: created, but the password was never set.
    if (user.UserStatus === 'FORCE_CHANGE_PASSWORD') {
      await cognito.send(
        new AdminSetUserPasswordCommand({ UserPoolId, Username: email, Password: password, Permanent: true }),
      )
    }
    counts.usersExisting++
  } catch (err) {
    if ((err as Error).name !== 'UserNotFoundException') throw err
    const created = await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId,
        Username: email,
        MessageAction: 'SUPPRESS', // Cognito default mail allows only a few mails per day
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
        ],
      }),
    )
    await cognito.send(
      new AdminSetUserPasswordCommand({ UserPoolId, Username: email, Password: password, Permanent: true }),
    )
    id = sub(created.User?.Attributes)
    counts.usersCreated++
  }
  if (group) await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId, Username: email, GroupName: group }))
  return id
}

/** Writes the item only if its key is new, so app changes (cancellations, room changes) survive a reseed. */
const putIfAbsent = async (Item: Record<string, unknown>): Promise<void> => {
  try {
    await db.send(new PutCommand({ TableName, Item, ConditionExpression: 'attribute_not_exists(PK)' }))
    counts.created++
  } catch (err) {
    if ((err as Error).name !== 'ConditionalCheckFailedException') throw err
    counts.existing++
  }
}

const putAll = async (items: Record<string, unknown>[]): Promise<void> => {
  for (let i = 0; i < items.length; i += 25) await Promise.all(items.slice(i, i + 25).map(putIfAbsent))
}

// --- Users ---
const subs: Record<string, string> = {}
for (const person of staff) subs[person.key] = await ensureUser(person.email, person.group)
const testUsers: string[] = []
for (let i = 1; i <= userCount; i++) testUsers.push(await ensureUser(testUserEmail(i)))

// --- Catalog ---
const now = new Date().toISOString()
const lecturerName = (key: string): string | undefined =>
  staff.flatMap((s) => (s.key === key && 'name' in s ? [s.name] : []))[0]

await putAll(programs.map((p) => ({ ...keys.program(p.id), name: p.name, semesters: p.semesters })))
await putAll(
  courses.map((c) => ({
    ...keys.course(c.id),
    name: c.name,
    shortName: c.shortName,
    programId: c.programId,
    semester: c.semester,
    lecturerId: subs[c.lecturer],
    lecturerName: lecturerName(c.lecturer),
    GSI1PK: keys.programSemester(c.programId, c.semester),
    GSI2PK: keys.lecturer(subs[c.lecturer]),
  })),
)
const courseName = Object.fromEntries(courses.map((c) => [c.id, c.name]))
await putAll(
  sessionsFor(new Date()).map((s) => ({
    ...keys.session(s.courseId, s.id),
    start: s.start,
    end: s.end,
    room: s.room,
    kind: s.kind,
    courseName: courseName[s.courseId],
    cancelled: false,
    updatedAt: now,
  })),
)

// Load-test users follow all SEB 7 courses, so their plan has content.
const seb7 = courses.filter((c) => c.programId === 'seb' && c.semester === 7).map((c) => c.id)
await putAll(testUsers.flatMap((userId) => seb7.map((courseId) => keys.subscription(userId, courseId))))

console.log(
  `seed ${env}: items created ${counts.created}, existing ${counts.existing}; ` +
    `users created ${counts.usersCreated}, existing ${counts.usersExisting}`,
)
