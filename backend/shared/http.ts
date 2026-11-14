// Responses in the shape of the API contract and the caller's identity from the JWT (ADR 0006).
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { ApiError } from './api.ts'

export type Result = APIGatewayProxyStructuredResultV2

export const json = (statusCode: number, body: unknown): Result => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

export const error = (statusCode: number, code: ApiError['code'], message: string): Result =>
  json(statusCode, { code, message })

export const noContent: Result = { statusCode: 204 }

/**
 * Cognito groups of the caller. The HTTP API passes array claims as a string, e.g. "[lecturer admin]";
 * a single group may also arrive as "lecturer".
 */
export const groupsOf = (event: APIGatewayProxyEventV2WithJWTAuthorizer): string[] => {
  const raw = event.requestContext.authorizer.jwt.claims['cognito:groups']
  if (Array.isArray(raw)) return raw.map(String)
  return String(raw ?? '')
    .replace(/^\[|\]$/g, '')
    .split(/[\s,]+/)
    .filter(Boolean)
}

/** Cognito `sub` of the caller; the only source of the user id, never path or body. */
export const userIdOf = (event: APIGatewayProxyEventV2WithJWTAuthorizer): string =>
  event.requestContext.authorizer.jwt.claims.sub as string

/** Request body as a JSON object, or an error message for a 400. */
export const bodyObject = (event: APIGatewayProxyEventV2WithJWTAuthorizer): Record<string, unknown> | string => {
  const raw = event.isBase64Encoded && event.body ? Buffer.from(event.body, 'base64').toString() : event.body
  let value: unknown
  try {
    value = JSON.parse(raw ?? '')
  } catch {
    return 'Body must be JSON'
  }
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : 'Body must be an object'
}
