// Types from the API contract (docs/api.yaml), generated once into the frontend (`npm run gen:api -w frontend`).
import type { components } from '../../frontend/src/api/schema.d.ts'

type Schemas = components['schemas']
export type Program = Schemas['Program']
export type Course = Schemas['Course']
export type CourseInput = Schemas['CourseInput']
export type Session = Schemas['Session']
export type SessionInput = Schemas['SessionInput']
export type LecturerSessionPatch = Schemas['LecturerSessionPatch']
export type ApiError = Schemas['Error']
export type PublicCourse = Schemas['PublicCourse']
export type PublicSession = Schemas['PublicSession']
