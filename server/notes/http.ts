import type { H3Event } from 'h3'
import type { ZodType } from 'zod'
import { isError } from 'h3'
import { checkAuthOrigin } from '../auth/http'
import { requireVerifiedSession } from '../auth/session'
import { withDemoAccess } from '../demo/lifecycle'
import { readApplicationJSON } from '../utils/readApplicationJSON'

export async function readNoteInput<T>(event: H3Event, schema: ZodType<T>) {
  if (!checkAuthOrigin(event)) {
    setResponseStatus(event, 403)

    return {
      error: { code: 'FORBIDDEN_ORIGIN' },
    } as const
  }

  // 100,000 UTF-16 units can require 600KB when JSON-escaped.
  const body = await readApplicationJSON(event, 650000)

  if ('error' in body)
    return body

  const parsed = schema.safeParse(body.data)

  if (!parsed.success) {
    setResponseStatus(event, 422)

    return {
      error: {
        code: 'VALIDATION',
        fields: Object.fromEntries(parsed.error.issues.map(issue => [issue.path[0] ?? 'note', issue.message])),
      },
    } as const
  }

  return { data: parsed.data }
}

// Keep application errors stable rather than exposing Nitro/ORM error envelopes.
export async function notesHTTP(event: H3Event, operation: (ownerId: string) => Promise<unknown>) {
  setHeader(event, 'Cache-Control', 'no-store')

  try {
    return await withDemoAccess(async () => {
      const session = await requireVerifiedSession(event)

      return operation(session.user.id)
    })
  } catch (error) {
    const status = isError(error) && [401, 403].includes(error.statusCode)
      ? error.statusCode
      : 503

    setResponseStatus(event, status)

    return {
      error: {
        code: status === 401
          ? 'UNAUTHENTICATED'
          : status === 403
            ? 'EMAIL_NOT_VERIFIED'
            : 'NOTES_UNAVAILABLE',
      },
    }
  }
}
