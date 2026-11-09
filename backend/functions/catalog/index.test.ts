import { beforeEach, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { DynamoDBRecord } from 'aws-lambda'
import { Ajv2020 } from 'ajv/dist/2020.js'
import { parse } from 'yaml'
import { db } from '../../shared/db.ts'
import { handler, s3, targetsOf } from './index.ts'

process.env.TABLE_NAME = 'table'
process.env.CATALOG_BUCKET = 'bucket'

// --- Response schemas of the static files from the contract ---
const api = parse(readFileSync(new URL('../../../docs/api.yaml', import.meta.url), 'utf8'))
const ajv = new Ajv2020({ strict: false, validateFormats: false })
ajv.addSchema({ $id: 'api', components: api.components })
const fileSchema = (path: string) =>
  ajv.compile(
    JSON.parse(
      JSON.stringify(api.paths[path].get.responses['200'].content['application/json'].schema).replaceAll(
        '"#/components',
        '"api#/components',
      ),
    ),
  )
const schemaOf = (key: string) =>
  key === 'catalog/programs.json'
    ? fileSchema('/catalog/programs.json')
    : key.startsWith('catalog/courses/')
      ? fileSchema('/catalog/courses/{programId}/{semester}.json')
      : fileSchema('/catalog/sessions/{courseId}.json')

// --- In-memory table and bucket ---
type Item = Record<string, unknown>
const course = (id: string, semester: number): Item => ({
  PK: `COURSE#${id}`,
  SK: 'META',
  name: id,
  programId: 'seb',
  semester,
  lecturerId: 'secret-lecturer-sub',
  lecturerName: 'Prof. Dr. Erika Beispiel',
  GSI1PK: `PROGRAM#seb#SEM#${semester}`,
})
const session = (courseId: string, id: string): Item => ({
  PK: `COURSE#${courseId}`,
  SK: `SESSION#${id}`,
  courseName: courseId,
  start: '2026-11-02T07:00:00.000Z',
  end: '2026-11-02T08:30:00.000Z',
  room: 'F.201',
  kind: 'lecture',
  cancelled: true,
  note: 'secret note',
  updatedAt: '2026-11-01T00:00:00.000Z',
})

let table: Item[]
let files: Map<string, { body: string; cacheControl?: string } | 'deleted'>
let writes: string[]

beforeEach(() => {
  table = [
    { PK: 'PROGRAMS', SK: 'PROGRAM#seb', name: 'Software Engineering (B.Sc.)', semesters: 7 },
    course('cc', 6),
    course('empty', 7),
    session('cc', '20261102T0700Z-aaaaaa'),
    session('cc', '20261109T0700Z-bbbbbb'),
  ]
  files = new Map()
  writes = []
  mock.method(db, 'send', async ({ input }: { input: Item }) => {
    if (input.Key) {
      const key = input.Key as Item
      return { Item: table.find((i) => i.PK === key.PK && i.SK === key.SK) }
    }
    const v = input.ExpressionAttributeValues as Record<string, string>
    const items =
      input.IndexName === 'GSI1'
        ? table.filter((i) => i.GSI1PK === v[':pk'])
        : table.filter((i) => i.PK === v[':pk'] && (!v[':session'] || (i.SK as string).startsWith(v[':session'])))
    return { Items: items.sort((a, b) => ((a.SK as string) < (b.SK as string) ? -1 : 1)) }
  })
  mock.method(s3, 'send', async ({ input }: { input: { Key: string; Body?: string; CacheControl?: string } }) => {
    writes.push(input.Key)
    files.set(input.Key, input.Body === undefined ? 'deleted' : { body: input.Body, cacheControl: input.CacheControl })
    return {}
  })
})

const record = (keys: { PK: string; SK: string }, oldImage?: Item, newImage?: Item): DynamoDBRecord => {
  const image = (i?: Item) => i && { programId: { S: i.programId as string }, semester: { N: String(i.semester) } }
  return {
    eventName: 'MODIFY',
    dynamodb: {
      Keys: { PK: { S: keys.PK }, SK: { S: keys.SK } },
      OldImage: image(oldImage),
      NewImage: image(newImage),
    },
  }
}

const assertValidAndClean = () => {
  for (const [key, file] of files) {
    if (file === 'deleted') continue
    const validate = schemaOf(key)
    assert.ok(validate(JSON.parse(file.body)), `${key}: ${JSON.stringify(validate.errors)}`)
    assert.equal(file.cacheControl, 'public,max-age=60')
    for (const secret of ['lecturerId', 'secret-lecturer-sub', 'note', 'secret note']) {
      assert.ok(!file.body.includes(secret), `${key} contains ${secret}`)
    }
  }
}

test('course moving to another semester rewrites old and new list and its sessions', async () => {
  const moved = table[1]
  await handler({ Records: [record({ PK: 'COURSE#cc', SK: 'META' }, { ...moved, semester: 7 }, moved)] })

  assert.deepEqual([...files.keys()].sort(), [
    'catalog/courses/seb/6.json',
    'catalog/courses/seb/7.json',
    'catalog/sessions/cc.json',
  ])
  const list = (key: string) => JSON.parse((files.get(key) as { body: string }).body).items.map((c: Item) => c.id)
  assert.deepEqual(list('catalog/courses/seb/6.json'), ['cc'])
  assert.deepEqual(list('catalog/courses/seb/7.json'), ['empty'])
  assert.deepEqual(list('catalog/sessions/cc.json'), ['20261102T0700Z-aaaaaa', '20261109T0700Z-bbbbbb'])
  assertValidAndClean()
})

test('duplicate delivery writes each file once and gives the same result', async () => {
  const r = record({ PK: 'COURSE#cc', SK: 'SESSION#20261102T0700Z-aaaaaa' })
  await handler({ Records: [r] })
  const once = new Map(files)
  writes = []
  await handler({ Records: [r, r, r] })
  assert.deepEqual(writes, ['catalog/sessions/cc.json'])
  assert.deepEqual(files, once)
})

test('deleted course loses its session file', async () => {
  table = table.filter((i) => i.PK !== 'COURSE#cc')
  await handler({ Records: [record({ PK: 'COURSE#cc', SK: 'META' }, table[1], undefined)] })
  assert.equal(files.get('catalog/sessions/cc.json'), 'deleted')
})

test('user and iCal items touch no file', () => {
  const t = targetsOf([record({ PK: 'USER#u1', SK: 'SUB#cc' }), record({ PK: 'ICAL#hash', SK: 'META' })])
  assert.deepEqual(t, { programs: false, courseLists: new Set(), courses: new Set() })
})

test('rebuild writes every file, including empty lists', async () => {
  await handler({ rebuild: true })
  assert.equal(files.size, 1 + 7 + 2)
  assert.deepEqual(JSON.parse((files.get('catalog/sessions/empty.json') as { body: string }).body), { items: [] })
  assert.deepEqual(JSON.parse((files.get('catalog/courses/seb/1.json') as { body: string }).body), { items: [] })
  assertValidAndClean()
})
