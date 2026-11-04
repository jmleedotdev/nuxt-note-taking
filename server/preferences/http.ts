import type { H3Event } from 'h3'
import { isError } from 'h3'
import { appearanceSchema } from '../../shared/schemas/preferences'
import { checkAuthOrigin } from '../auth/http'
import { requireVerifiedSession } from '../auth/session'
import { readApplicationJSON } from '../utils/readApplicationJSON'

export async function readAppearanceInput(event: H3Event) {
  if (!checkAuthOrigin(event)) {
    setResponseStatus(event, 403)

    return {
      error: { code: 'FORBIDDEN_ORIGIN' },
    } as const
  }

  const body = await readApplicationJSON(event, 4096)

  if ('error' in body)
    return body

  const parsed = appearanceSchema.safeParse(body.data)

  if (!parsed.success) {
    setResponseStatus(event, 422)

    return {
      error: {
        code: 'VALIDATION',
        fields: Object.fromEntries(parsed.error.issues.map(issue => [issue.path[0] ?? 'appearance', issue.message])),
      },
    } as const
  }

  return { data: parsed.data }
}

export async function preferencesHTTP(event: H3Event, operation: (ownerId: string) => Promise<unknown>) {
  setHeader(event, 'Cache-Control', 'no-store')

  try {
    const session = await requireVerifiedSession(event)

    return await operation(session.user.id)
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
            : 'PREFERENCES_UNAVAILABLE',
      },
    }
  }
}
