import type { H3Event } from 'h3'
import { isError } from 'h3'
import { requireVerifiedSession } from '../auth/session'

// Keep application errors stable rather than exposing Nitro/ORM error envelopes.
export async function notesHTTP(event: H3Event, operation: (ownerId: string) => Promise<unknown>) {
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
            : 'NOTES_UNAVAILABLE',
      },
    }
  }
}
