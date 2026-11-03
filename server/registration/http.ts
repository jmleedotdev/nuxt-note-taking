import type { H3Event } from 'h3'
import type { z } from 'zod'
import { Buffer } from 'node:buffer'
import { registrationConfig } from './config'
import { consumeRegistrationLimit, registrationClientIP } from './limits'
import { registrationService } from './service'

function checkRegistrationOrigin(event: H3Event) {
  return getHeader(event, 'origin') === registrationConfig().APP_URL
    && getHeader(event, 'content-type')?.split(';')[0] === 'application/json'
    && getHeader(event, 'sec-fetch-site') !== 'cross-site'
}

async function registrationInput<T>(event: H3Event, schema: z.ZodType<T>) {
  // Bound the stream before parsing JSON, including chunked requests.
  const chunks: Buffer[] = []

  let size = 0

  for await (const chunk of event.node.req) {
    size += Buffer.byteLength(chunk)

    if (size > 4096) {
      setResponseStatus(event, 413)

      return {
        error: { code: 'REQUEST_TOO_LARGE' },
      } as const
    }

    chunks.push(Buffer.from(chunk))
  }

  let body: unknown

  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    setResponseStatus(event, 400)

    return {
      error: { code: 'INVALID_REQUEST' },
    } as const
  }

  const parsed = schema.safeParse(body)

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

export async function admitRegistration<T extends { email: string }>(event: H3Event, schema: z.ZodType<T>) {
  if (!checkRegistrationOrigin(event)) {
    setResponseStatus(event, 403)

    return {
      response: {
        error: { code: 'FORBIDDEN_ORIGIN' },
      },
    }
  }

  const parsed = await registrationInput(event, schema)

  if ('error' in parsed) {
    return { response: parsed }
  }

  const service = registrationService()
  const retryAfter = await consumeRegistrationLimit(service, registrationClientIP(event, service), parsed.data.email)

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
