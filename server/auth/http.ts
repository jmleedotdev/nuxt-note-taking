import type { H3Event } from 'h3'
import type { z } from 'zod'
import { readApplicationJSON } from '../utils/readApplicationJSON'
import { authConfig } from './config'
import { authClientIP, consumeAuthLimit } from './limits'
import { authService } from './service'

export function checkAuthOrigin(event: H3Event) {
  return getHeader(event, 'origin') === authConfig().APP_URL
    && getHeader(event, 'content-type')?.split(';')[0] === 'application/json'
    && getHeader(event, 'sec-fetch-site') !== 'cross-site'
}

async function authInput<T>(event: H3Event, schema: z.ZodType<T>) {
  const body = await readApplicationJSON(event, 4096)

  if ('error' in body)
    return body

  const parsed = schema.safeParse(body.data)

  if (!parsed.success) {
    setResponseStatus(event, 422)

    return {
      error: {
        code: 'VALIDATION',
        fields: Object.fromEntries(parsed.error.issues.map(issue => [issue.path[0], issue.message])),
      },
    } as const
  }

  return { data: parsed.data }
}

export async function admitAuth<T extends { email: string }>(event: H3Event, schema: z.ZodType<T>, purpose: 'registration' | 'login' = 'registration') {
  if (!checkAuthOrigin(event)) {
    setResponseStatus(event, 403)

    return {
      response: {
        error: { code: 'FORBIDDEN_ORIGIN' },
      },
    }
  }

  const parsed = await authInput(event, schema)

  if ('error' in parsed) {
    return { response: parsed }
  }

  const service = authService()
  const retryAfter = await consumeAuthLimit(service, authClientIP(event, service), parsed.data.email, purpose)

  if (retryAfter) {
    setResponseStatus(event, 429)
    setHeader(event, 'Retry-After', retryAfter)

    return {
      response: {
        error: { code: 'RATE_LIMITED' },
        retryAfter,
      },
    }
  }

  return {
    data: parsed.data,
    service,
    headers: new Headers(getRequestHeaders(event) as HeadersInit),
  }
}
